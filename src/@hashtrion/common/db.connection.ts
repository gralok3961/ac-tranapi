import { config } from "mssql";
import * as dotenv from "dotenv";
import { EnvironmentType } from "./types/common-variables";

dotenv.config();

const isProduction = process.env.NODE_ENV === EnvironmentType.PROD;

console.log("[Database Config]", isProduction);

export const dbConfig: config = {
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    server: process.env.DB_SERVER || "",
    database: process.env.DB_NAME || "",
    port: 1433,
    options: {
        encrypt: true,
        trustServerCertificate: !isProduction
    },
    pool: {
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000
    }
};
