import "reflect-metadata";
import { createApplication } from "./bootstrap.js";
import { ENVIRONMENT, type Environment } from "./config/environment.js";

const app = await createApplication();
const environment = app.get<Environment>(ENVIRONMENT);
await app.listen(environment.PORT, environment.HOST);
