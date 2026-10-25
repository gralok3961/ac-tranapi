const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
require('reflect-metadata');
const baseUrl = path.resolve(__dirname, '..', process.env.TEST_COMPILED === '1' ? 'dist' : 'src');
if (process.env.TEST_COMPILED !== '1') require('ts-node/register');
require('tsconfig-paths').register({ baseUrl, paths: require('../tsconfig.json').compilerOptions.paths });
const sqlPath = require.resolve(path.join(baseUrl, '@hashtrion/common/services/sql-db.service'));
require.cache[sqlPath] = { id: sqlPath, filename: sqlPath, loaded: true, exports: { SQLDatabaseService: class {} } };
const { Wallet, decode } = require('xrpl');
const { XrplClient } = require(path.join(baseUrl, 'blockchains/xrpl/xrpl-client'));
const { AgentAccountService } = require(path.join(baseUrl, 'services/agent-account.service'));
const { AgentAccountExecutionValidator } = require(path.join(baseUrl, 'validators/agent-account-execution-validator'));
const owner = Wallet.fromEntropy(new Uint8Array(16).fill(1), { algorithm: 'secp256k1' });
const authority = Wallet.fromEntropy(new Uint8Array(16).fill(2), { algorithm: 'secp256k1' });
const other = Wallet.fromEntropy(new Uint8Array(16).fill(3), { algorithm: 'secp256k1' });
const accountId = '00000000-0000-4000-8000-000000000001';
const authorityId = '00000000-0000-4000-8000-000000000002';
const installation = '00000000-0000-4000-8000-000000000003';
const context = { agentAccountId: accountId, signingAuthorityId: authorityId, appInstallationId: installation,
    chainId: 1, publicAddress: owner.address, delegatedAuthorityIdentifier: authority.address,
    signingAuthorityStatus: 2, isRevoked: false };
function signed(extra = {}, signer = owner) {
    return signer.sign({ TransactionType: 'SetRegularKey', Account: owner.address, Fee: '12',
        Sequence: 10, LastLedgerSequence: 120, ...extra });
}
function fixture(extra = {}, signer = owner) {
    const tx = signed(extra, signer);
    const request = { ...context, payload: tx.tx_blob, txHash: tx.hash };
    const result = { validated: true, hash: tx.hash, ledger_index: 110, tx_json: decode(tx.tx_blob),
        meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [{ ModifiedNode: { LedgerEntryType: 'AccountRoot',
            FinalFields: { Account: owner.address }, PreviousFields: { RegularKey: authority.address } } }] } };
    const account = { validated: true, ledger_index: 111, account_data: { Account: owner.address } };
    return { request, result, account };
}
function harness(f = fixture(), options = {}) {
    let submissions = 0;
    let syncs = 0;
    const calls = [];
    const client = Object.create(XrplClient.prototype);
    client.ensureConnected = async () => {};
    client.client = {
        async request(request) {
            calls.push(request);
            if (request.command === 'tx') {
                if (options.missing) throw { data: { error: 'txnNotFound' } };
                if (options.rpcError) throw new Error('RPC unavailable');
                return { result: f.result };
            }
            if (options.missing && submissions === 0) return { result: options.beforeAccount ?? {
                validated: true, ledger_index: 109, account_data: { Account: owner.address, RegularKey: authority.address } } };
            return { result: f.account };
        },
        async submitAndWait(blob) { submissions++; assert.equal(blob, f.request.payload); return { result: f.result }; }
    };
    let current = { ...context, ...options.context };
    const platform = {
        async getAgentAccountRevocationContext() { return current; },
        async revokeAgentAccount(dto) {
            syncs++;
            if (options.syncError) throw new Error('SQL unavailable');
            return { agentAccountId: dto.agentAccountId, signingAuthorityId: dto.signingAuthorityId,
                txHash: dto.txHash, ledgerIndex: dto.ledgerIndex };
        }
    };
    const service = new AgentAccountService(platform,
        { revokeAgentSigningAuthority: (request, ctx) => client.revokeAgentSigningAuthority(request, ctx) },
        new AgentAccountExecutionValidator());
    return { client, service, calls, platform, counts: () => ({ submissions, syncs }),
        setContext(value) { current = value; } };
}

test('new validated removal submits once, verifies ledger state, then synchronizes exact target', async () => {
    const f = fixture(); const h = harness(f, { missing: true });
    const result = await h.service.revokeAgentAccount(f.request, installation);
    assert.equal(result.txHash, f.request.txHash);
    assert.deepEqual(h.counts(), { submissions: 1, syncs: 1 });
    assert.equal(h.calls.at(-1).ledger_index, 'validated');
});

test('confirmed hash-only recovery performs no new submission', async () => {
    const f = fixture(); const h = harness(f);
    await h.service.revokeAgentAccount({ ...f.request, payload: undefined }, installation);
    assert.deepEqual(h.counts(), { submissions: 0, syncs: 1 });
});

test('SQL failure preserves the same verified hash for an explicit retry', async () => {
    const f = fixture(); const options = { syncError: true }; const h = harness(f, options);
    await assert.rejects(h.service.revokeAgentAccount(f.request, installation), /SQL unavailable/);
    options.syncError = false;
    await h.service.revokeAgentAccount({ ...f.request, payload: undefined }, installation);
    assert.deepEqual(h.counts(), { submissions: 0, syncs: 2 });
});

for (const [name, mutate] of [
    ['incorrect Account', f => { f.request.publicAddress = other.address; }],
    ['wrong installation', () => {}],
    ['wrong registration', f => { f.request.agentAccountId = authorityId; }],
    ['wrong authority', f => { f.request.signingAuthorityId = accountId; }],
    ['wrong chain', f => { f.request.chainId = 2; }],
    ['wrong hash', f => { f.request.txHash = 'A'.repeat(64); }]
]) test(`${name} is rejected without SQL synchronization`, async () => {
    const f = fixture(); mutate(f); const h = harness(f);
    await assert.rejects(h.service.revokeAgentAccount(f.request, name === 'wrong installation' ? accountId : installation));
    assert.equal(h.counts().syncs, 0);
    assert.equal(h.counts().submissions, 0);
});

test('activation with RegularKey remains valid XRPL but cannot be used as revocation', async () => {
    const f = fixture({ RegularKey: authority.address }); const h = harness(f);
    assert.equal(decode(f.request.payload).RegularKey, authority.address);
    await assert.rejects(h.service.revokeAgentAccount(f.request, installation), /Invalid owner-signed/);
    assert.equal(h.counts().syncs, 0);
});

test('empty RegularKey is rejected rather than interpreted as omission', () => {
    const f = fixture(); const h = harness(f);
    assert.throws(() => h.client.validateRevocationTransaction({ ...f.result.tx_json, RegularKey: '' }, owner.address));
});

test('KMS/other key cannot sign owner revocation', async () => {
    const f = fixture({}, authority); const h = harness(f);
    await assert.rejects(h.service.revokeAgentAccount(f.request, installation), /Invalid owner-signed/);
    assert.equal(h.counts().syncs, 0);
});

test('tampered signature is rejected', async () => {
    const f = fixture();
    const tx = decode(f.request.payload);
    tx.TxnSignature = tx.TxnSignature.slice(0, -2) + (tx.TxnSignature.endsWith('00') ? '01' : '00');
    f.request.payload = require('xrpl').encode(tx);
    const h = harness(f);
    await assert.rejects(h.service.revokeAgentAccount(f.request, installation), /Invalid owner-signed/);
    assert.equal(h.counts().syncs, 0);
});

for (const [name, mutate] of [
    ['unvalidated', f => { f.result.validated = false; }],
    ['wrong returned hash', f => { f.result.hash = 'F'.repeat(64); }],
    ['confirmed failure', f => { f.result.meta.TransactionResult = 'tecNO_ALTERNATIVE_KEY'; }],
    ['missing account_data', f => { delete f.account.account_data; }],
    ['wrong account_data', f => { f.account.account_data.Account = other.address; }],
    ['remaining RegularKey', f => { f.account.account_data.RegularKey = authority.address; }],
    ['unvalidated account_info', f => { f.account.validated = false; }],
    ['stale account_info', f => { f.account.ledger_index = 109; }],
    ['missing metadata proof', f => { f.result.meta.AffectedNodes = []; }],
    ['another authority removed', f => { f.result.meta.AffectedNodes[0].ModifiedNode.PreviousFields.RegularKey = other.address; }]
]) test(`${name} cannot trigger SQL revocation`, async () => {
    const f = fixture(); mutate(f); const h = harness(f);
    await assert.rejects(h.service.revokeAgentAccount(f.request, installation));
    assert.equal(h.counts().syncs, 0);
});

test('RPC error is not evidence of successful removal', async () => {
    const f = fixture(); const h = harness(f, { rpcError: true });
    await assert.rejects(h.service.revokeAgentAccount(f.request, installation), /RPC unavailable/);
    assert.deepEqual(h.counts(), { submissions: 0, syncs: 0 });
});

test('unknown hash-only outcome never submits or synchronizes', async () => {
    const f = fixture(); const h = harness(f, { missing: true });
    await assert.rejects(h.service.revokeAgentAccount({ ...f.request, payload: undefined }, installation));
    assert.deepEqual(h.counts(), { submissions: 0, syncs: 0 });
});

test('repeated completion is bound to historical IDs and removal ledger', async () => {
    const f = fixture(); const h = harness(f, { context: { isRevoked: true, signingAuthorityStatus: 3 } });
    await h.service.revokeAgentAccount({ ...f.request, payload: undefined }, installation);
    assert.equal(h.calls.at(-1).ledger_index, 110);
    h.setContext({ ...context, agentAccountId: authorityId });
    await assert.rejects(h.service.revokeAgentAccount(f.request, installation), /context does not match/);
    assert.equal(h.counts().syncs, 1);
});

test('activation service continues to set and verify the provisioned RegularKey', async () => {
    const calls = [];
    const platform = {
        getAgentAccountActivationContext: async () => ({ ...context, publicId: 'agt_fixture', signingAuthorityStatus: 1 }),
        activateAgentSigningAuthority: async dto => { calls.push(dto); return { ...dto, status: 2 }; }
    };
    const blockchain = {
        decodeAgentAccountActivationTransaction: () => ({ transactionType: 'SetRegularKey', publicAddress: owner.address,
            delegatedAuthorityIdentifier: authority.address }),
        submitAgentAccountActivationAndWait: async () => ({ txHash: 'B'.repeat(64), ledgerIndex: 110, blockchainResultCode: 'tesSUCCESS' }),
        verifyAgentSigningAuthority: async (_chain, account, key) => account === owner.address && key === authority.address
    };
    const service = new AgentAccountService(platform, blockchain, new AgentAccountExecutionValidator());
    const result = await service.activateAgentAccount({ agentAccountId: accountId, payload: 'fixture' }, installation);
    assert.equal(result.delegatedAuthorityIdentifier, authority.address);
    assert.deepEqual(calls, [{ agentAccountId: accountId, signingAuthorityId: authorityId }]);
});

for (const account of [
    { validated: false, account_data: { Account: owner.address, RegularKey: authority.address } },
    { validated: true },
    { validated: true, account_data: { Account: owner.address } },
    { validated: true, account_data: { Account: owner.address, RegularKey: other.address } }
]) test('first submission requires the exact current validated authority', async () => {
    const f = fixture(); const h = harness(f, { missing: true, beforeAccount: account });
    await assert.rejects(h.service.revokeAgentAccount(f.request, installation), /current validated RegularKey/);
    assert.deepEqual(h.counts(), { submissions: 0, syncs: 0 });
});

test('context lookup verifies the owner signature and binds the installation and delegate', async () => {
    const keypairs = require('ripple-keypairs');
    const timestamp = Math.floor(Date.now() / 1000);
    const challenge = `REVOKE_AGENT_CONTEXT|1|${owner.address}|${authority.address}|${timestamp}`;
    const request = { chainId: 1, publicAddress: owner.address, delegatedAuthorityIdentifier: authority.address,
        publicKey: owner.publicKey, timestamp, signature: keypairs.sign(Buffer.from(challenge).toString('hex'), owner.privateKey) };
    const client = Object.create(XrplClient.prototype);
    let lookups = 0;
    const service = new AgentAccountService({ getAgentAccountRevocationContext: async dto => {
        lookups++; assert.equal(dto.appInstallationId, installation);
        assert.equal(dto.delegatedAuthorityIdentifier, authority.address); return context;
    } }, { isValidAddress: address => require('xrpl').isValidClassicAddress(address),
        verifyChallengeSignature: params => client.verifyChallengeSignature(params) }, new AgentAccountExecutionValidator());
    assert.equal(await service.getAgentAccountRevocationContext(request, installation), context);
    await assert.rejects(service.getAgentAccountRevocationContext({ ...request, delegatedAuthorityIdentifier: other.address }, installation));
    await assert.rejects(service.getAgentAccountRevocationContext({ ...request, timestamp: timestamp - 121 }, installation));
    assert.equal(lookups, 1);
});
