const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const sql = require('mssql');
const { createRequire } = require('node:module');
const tedious = createRequire(require.resolve('mssql'))('tedious');

require('reflect-metadata');
const root = path.resolve(__dirname, '..');
const baseUrl = path.join(root, process.env.TEST_COMPILED === '1' ? 'dist' : 'src');
if (process.env.TEST_COMPILED !== '1') require('ts-node/register');
require('tsconfig-paths').register({ baseUrl, paths: require('../tsconfig.json').compilerOptions.paths });

// Prevent loading local credentials or application database services in offline tests.
const servicePath = require.resolve(path.join(baseUrl, '@hashtrion/common/services/sql-db.service'));
require.cache[servicePath] = {
    id: servicePath, filename: servicePath, loaded: true,
    exports: { SQLDatabaseService: class SQLDatabaseService {} }
};
const { CryptoPaymentRepository } = require(path.join(baseUrl, 'repositories/crypto-payment.repository'));

function harness(rowsAffected = 1) {
    const requests = [];
    const connection = new EventEmitter();
    connection.execSql = request => {
        // Exercise the actual mssql -> tedious parameter mapping and validation.
        request.validateParameters();
        requests.push(request);
        request.emit('doneInProc', rowsAffected, false, []);
        request.callback();
    };
    const pool = {
        connected: true, config: {},
        acquire(_request, callback) { callback(null, connection, this.config); },
        release() {},
        request() { return new sql.Request(this); }
    };
    return {
        requests,
        repository: new CryptoPaymentRepository({ async getConnectionAsync() { return pool; } })
    };
}

const id = '00000000-0000-4000-8000-000000000001';
const hash = 'A'.repeat(64);
function completion(amount, fxRate, settlementAmount) {
    return {
        Id: id, BlockchainNetwork: 'xrpl', PaymentAsset: 'RLUSD', BlockchainTxHash: hash,
        PaymentFeeNative: '12', PaymentAmount: amount, PayerAddress: 'synthetic-payer',
        ReceiverAddress: 'synthetic-receiver', FxRate: fxRate, FxProvider: 'fixture',
        FxCapturedAt: new Date('2026-01-01T00:00:00Z'), SettlementCurrency: 'USD',
        SettlementAmount: settlementAmount
    };
}

function assertExactParameter(request, name, original, column, precision, scale) {
    const parameter = request.parameters.find(p => p.name === name);
    assert.equal(parameter.type, tedious.TYPES.NVarChar);
    assert.equal(parameter.length, sql.MAX);
    assert.equal(parameter.value, original);
    // Decode the driver's actual NVARCHAR(MAX) PLP chunks, without numerical conversion.
    const bytes = Buffer.concat([...parameter.type.generateParameterData(parameter, {})]);
    let offset = 0;
    const chunks = [];
    while (true) {
        const length = bytes.readUInt32LE(offset);
        offset += 4;
        if (length === 0) break;
        chunks.push(bytes.subarray(offset, offset + length));
        offset += length;
    }
    assert.equal(offset, bytes.length);
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(original, 'utf16le'));
    assert.equal(Buffer.concat(chunks).toString('utf16le'), original);
    // Assert the actual SQL server conversion target, not an emulated SQL conversion.
    assert.match(request.sqlTextOrProcedure,
        new RegExp(`${column} = CONVERT\\(decimal\\(${precision}, ${scale}\\), @${name}\\)`));
    const [integer, fraction = ''] = original.split('.');
    assert.ok(integer.replace(/^0+/, '').length <= precision - scale);
    assert.ok(fraction.length <= scale);
}

const cases = [
    ['reported regression', '90071992.54740991', '1.1234567891', '3.00'],
    ['small XRP', '0.000001', '2.5000000000', '0.01'],
    ['small RLUSD', '1.23456789', '1.0000000000', '1.23'],
    ['smallest supported units', '0.00000001', '0.0000000001', '0.01'],
    ['maximum supported precision', '99999999999999999999.99999999',
        '999999999999999999.9999999999', '9999999999999999.99'],
    ['trailing zeros and zero settlement', '1.23000000', '0.5000000000', '0.00']
];
for (const [name, amount, fxRate, settlementAmount] of cases) {
    test(`exact SQL-bound strings and conversion types: ${name}`, async () => {
        const { repository, requests } = harness();
        await repository.markPendingForSubmission(id, 'xrpl', hash, 'RLUSD', amount,
            '12', 'synthetic-payer', 'synthetic-receiver');
        await repository.completePayment(completion(amount, fxRate, settlementAmount));
        assertExactParameter(requests[0], 'amount', amount, 'PaymentAmount', 28, 8);
        assertExactParameter(requests[1], 'amount', amount, 'PaymentAmount', 28, 8);
        assertExactParameter(requests[1], 'fxRate', fxRate, 'FxRate', 28, 10);
        assertExactParameter(requests[1], 'settlementAmount', settlementAmount, 'SettlementAmount', 18, 2);
    });
}

test('direct Decimal binding still loses precision inside the installed driver', () => {
    assert.notEqual(String(tedious.TYPES.Decimal.validate('90071992.54740991')), '90071992.54740991');
});

test('monetary input remains a parameter rather than SQL text', async () => {
    const { repository, requests } = harness();
    const input = "1'; SELECT 1; --";
    await repository.markPendingForSubmission(id, 'xrpl', hash, 'RLUSD', input,
        '12', 'synthetic-payer', 'synthetic-receiver');
    assert.equal(requests[0].parameters.find(p => p.name === 'amount').value, input);
    assert.ok(!requests[0].sqlTextOrProcedure.includes(input));
    assert.match(requests[0].sqlTextOrProcedure, /CONVERT\(decimal\(28, 8\), @amount\)/);
});

test('submission, completion and failure retain their conditional state transitions', async () => {
    const { repository, requests } = harness();
    await repository.markPendingForSubmission(id, 'xrpl', hash, 'XRP', '1.000001',
        '12', 'synthetic-payer', 'synthetic-receiver');
    await repository.completePayment(completion('1.000001', '2.00', '2.00'));
    await repository.markAsFailed(id, 'confirmed failure');
    assert.match(requests[0].sqlTextOrProcedure, /Status = 1,[\s\S]*WHERE Id = @paymentId\s+AND Status = 0\s+AND BlockchainTxHash IS NULL/);
    assert.match(requests[1].sqlTextOrProcedure, /Status = 2,[\s\S]*WHERE Id = @paymentId\s+AND Status = 1\s+AND LOWER\(BlockchainTxHash\) = LOWER\(@txHash\)\s+AND LOWER\(BlockchainNetwork\) = LOWER\(@network\)/);
    assert.match(requests[2].sqlTextOrProcedure, /Status = 3,[\s\S]*WHERE Id = @paymentId\s+AND Status = 1/);
});

for (const method of ['markPendingForSubmission', 'completePayment', 'markAsFailed']) {
    test(`${method} still rejects an unsuccessful conditional update`, async () => {
        const { repository } = harness(0);
        const args = method === 'markPendingForSubmission'
            ? [id, 'xrpl', hash, 'XRP', '1.000001', '12', 'synthetic-payer', 'synthetic-receiver']
            : method === 'completePayment' ? [completion('1.000001', '2.00', '2.00')]
                : [id, 'confirmed failure'];
        await assert.rejects(repository[method](...args), error => error.statusCode === 409);
    });
}
