import { Configuration, PlaidApi, PlaidEnvironments } from "plaid"

let _client: PlaidApi | null = null

export function getPlaidClient(): PlaidApi {
  if (!_client) {
    const config = new Configuration({
      basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments ?? "sandbox"],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
          "PLAID-SECRET": process.env.PLAID_SECRET!,
        },
      },
    })
    _client = new PlaidApi(config)
  }
  return _client
}
