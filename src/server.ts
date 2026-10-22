import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();
import { container } from "./@hashtrion/application/inversion-control/inversify.config";
import { errorMiddleWare } from "@hashtrion/common/middlewares/error.middleware";
import { SQLDatabaseService } from "@hashtrion/common/services/sql-db.service";
import { EnvironmentType } from "./@hashtrion/common/types/common-variables";
import { loadSecrets } from "./@hashtrion/application/config/config.init";
import { getCurrentTime } from "./@hashtrion/common/utils/common-value";
import { InversifyExpressServer } from "inversify-express-utils";
import { registerGracefulShutdown } from "./shutdown";
import { XrplClient } from "blockchains/xrpl/xrpl-client";
import { underline, white } from "colorette";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import http from "http";

const PORT = process.env.PORT || 9003;

(async () => {

    try {
        // Load authentication secrets before accepting requests.
        await loadSecrets();

        const databaseService = container.get(SQLDatabaseService);
        const xrplClient = container.get(XrplClient);
        await databaseService.connect();
        await xrplClient.connect();
        const server = new InversifyExpressServer(container);

        server.setConfig((app) => {

            if (process.env.NODE_ENV === EnvironmentType.LOCAL) {
                app.use(morgan("dev"));
            }

            app.use(cors());
            app.use(express.json());

            app.get("/", (_, res) => {
                res.send(`Hashtrion Agentic Commerce Tran API - ${getCurrentTime()}`);
            });
        });

        server.setErrorConfig((app) => {
            app.use(errorMiddleWare);
        });

        const app = server.build();

        const httpServer = http.createServer(app);


        const serverInstance = httpServer.listen(PORT, () => {
            console.log(underline(white(`Server running on ports ${PORT}`)));
        });

        registerGracefulShutdown(container, serverInstance);

    } catch (err) {

        console.error("Server startup failed:", err);
        process.exit(1);
    }
})();
