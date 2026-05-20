import { listPriceTiers } from "@/features/plan-request-pricing/queries";

import { Step1Wizard } from "./_components/step1-wizard";

export default async function NewRequestPage() {
  const priceTiers = await listPriceTiers();
  return <Step1Wizard priceTiers={priceTiers} />;
}
