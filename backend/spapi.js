import { Sellers, Marketplaces } from "amazon-sp-api";

export async function testSellers(creds) {
  const sellers = new Sellers({ marketplace: Marketplaces.US, credentials: creds });
  const r = await sellers.getMarketplaceParticipations();
  return r?.payload ?? {};
}