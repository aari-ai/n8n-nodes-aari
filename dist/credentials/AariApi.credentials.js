"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AariApi = void 0;
class AariApi {
    constructor() {
        this.name = "aariApi";
        this.displayName = "AARI API";
        this.documentationUrl = "https://api.getaari.com/docs";
        this.properties = [
            {
                displayName: "API Key",
                name: "apiKey",
                type: "string",
                typeOptions: { password: true },
                default: "",
                placeholder: "sk_aari_...",
                required: true,
            },
            {
                displayName: "Server URL",
                name: "server",
                type: "string",
                default: "https://api.getaari.com",
                description: "AARI server URL. Leave default for cloud.",
            },
        ];
    }
}
exports.AariApi = AariApi;
//# sourceMappingURL=AariApi.credentials.js.map