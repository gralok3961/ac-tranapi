export const AGENT_ACTIVE_SIGNING_CONTEXT_SELECT = `
    SELECT
        a.Id AS agentAccountId,
        a.ChainId AS chainId,
        a.PublicAddress AS publicAddress,
        s.ProviderKeyReference AS providerKeyReference,
        s.PublicKey AS publicKey
    FROM dbo.AgentAccounts a
    JOIN dbo.AgentSigningAuthorities s
        ON s.AgentAccountId = a.Id
    WHERE a.Id = @agentAccountId
      AND a.Status = 1
      AND a.DeletedAt IS NULL
      AND s.Status = 2
      AND s.RevokedAt IS NULL
      AND s.DeletedAt IS NULL
`;