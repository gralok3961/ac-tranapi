import { SQLDatabaseService } from "@hashtrion/common/services/sql-db.service";
import { XrplClient } from "blockchains/xrpl/xrpl-client";
import { red, black, white } from "colorette";
import { Container } from "inversify";
import { Server } from "http";

export function registerGracefulShutdown(container: Container, server: Server): void {

    let shuttingDown = false;

    const shutdown = async (signal: string) => {

        if (shuttingDown) return;

        shuttingDown = true;

        console.log(black(`\nReceived ${signal}. Shutting down gracefully...`));

        try {

            await new Promise<void>((resolve) => {
                server.close(() => {
                    console.log(white("HTTP server closed."));
                    resolve();
                });
            });

            const xrpl = container.get<XrplClient>(XrplClient);
            if (xrpl.instance?.isConnected()) {
                await xrpl.instance.disconnect();
                console.log(white("XRPL connection closed."));
            }

            const databaseService = container.get<SQLDatabaseService>(SQLDatabaseService);
            await databaseService.close();

        } catch (err) {
            console.error(red("Error during shutdown:"), err);
        } finally {
            process.exit(0);
        }
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}
