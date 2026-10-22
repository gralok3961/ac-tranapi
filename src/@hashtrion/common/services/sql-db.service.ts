import { injectable } from "inversify";
import sql from "mssql";
import { dbConfig } from "../db.connection";

@injectable()
export class SQLDatabaseService {

    private pool: sql.ConnectionPool | null = null;
    private connecting: Promise<sql.ConnectionPool> | null = null;
    private isShuttingDown = false;

    // Share an in-flight connection attempt between callers.
    public async connect(): Promise<void> {

        if (this.isShuttingDown) {
            throw new Error("Database is shutting down.");
        }

        if (this.pool?.connected) return;

        if (!this.connecting) {

            this.connecting = new sql.ConnectionPool(dbConfig)
                .connect()
                .then(pool => {

                    pool.on("error", err => {
                        console.error("SQL Pool Error:", err);
                        this.pool = null;
                        this.connecting = null;
                    });

                    this.pool = pool;

                    console.log("MSSQL Connected");

                    return pool;
                })
                .catch(err => {

                    this.pool = null;
                    this.connecting = null;

                    throw err;
                });
        }

        await this.connecting;
    }

    public async getConnectionAsync(): Promise<sql.ConnectionPool> {

        if (!this.pool || !this.pool.connected) {
            await this.connect();
        }

        if (!this.pool || !this.pool.connected) {
            throw new Error("Database connection not established.");
        }

        return this.pool;
    }

    public async close(): Promise<void> {

        this.isShuttingDown = true;

        if (this.pool) {

            try {

                await this.pool.close();

                console.log("SQL connection pool closed.");

            } catch (err) {

                console.error("Error closing SQL pool:", err);

            } finally {

                this.pool = null;
                this.connecting = null;
            }
        }
    }
}