import type { ICredentialType, INodeProperties } from "n8n-workflow";

export class AariApi implements ICredentialType {
  name = "aariApi";
  displayName = "AARI API";
  documentationUrl = "https://api.getaari.com/docs";
  properties: INodeProperties[] = [
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
