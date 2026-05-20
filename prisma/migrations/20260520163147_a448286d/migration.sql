-- AlterTable
ALTER TABLE "partner_credit_balance" ADD COLUMN     "debt" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "partner_credit_ledger" ADD COLUMN     "debt_after" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "plan_request" ADD COLUMN     "price" INTEGER;

-- CreateTable
CREATE TABLE "plan_request_price_tier" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "budget_min" INTEGER NOT NULL,
    "budget_max" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_request_price_tier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_price_tier_position_key" ON "plan_request_price_tier"("position");

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_price_tier_budget_min_budget_max_key" ON "plan_request_price_tier"("budget_min", "budget_max");
