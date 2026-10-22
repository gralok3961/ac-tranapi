import { ClientSecretCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { black, blue, underline } from "colorette";

export async function loadSecrets() {

    const credential = new ClientSecretCredential(
        process.env.AZURE_TENANT_ID || '',
        process.env.AZURE_CLIENT_ID || '',
        process.env.AZURE_CLIENT_SECRET || ''
    );
    const keyVaultName = process.env.AZURE_KEY_VAULT_NAME!;

    const keyVaultUrl = `https://${keyVaultName}.vault.azure.net/`;

    const client = new SecretClient(keyVaultUrl, credential);

    try {

        console.log(underline(black(`Connecting to the keyvault chain..`)));
        const appClientSecretName = process.env.AZURE_APPCLIENT_SECRET_NAME || '';

        const appClientSecret = await client.getSecret(appClientSecretName);

        process.env.APPCLIENT_SECRET = appClientSecret.value;

        console.log(underline(blue(`App Client Secret #${appClientSecretName} is successfully loaded`)));

        const internalapiKeyName = process.env.AZURE_INTERNAL_APIKEY_NAME || '';

        const internalAPIKey = await client.getSecret(internalapiKeyName);

        process.env.INTERNAL_API_KEY = internalAPIKey.value;

        console.log(underline(blue(`Internal APIKey #${appClientSecretName} is successfully loaded`)));
        
    } catch (err) {

        console.error('Error retrieving secret:', err);
    }
}
