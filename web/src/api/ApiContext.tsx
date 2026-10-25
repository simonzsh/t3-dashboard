import { createContext, useContext } from "react";
import { api, type Api } from "./client.ts";

// The real api by default: a test or a preview can wrap a screen in another one.
const ApiContext = createContext<Api>(api);

export const ApiProvider = ApiContext.Provider;
export const useApi = (): Api => useContext(ApiContext);
