-- CreateTable
CREATE TABLE "partner_credit_balance" (
    "partner_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_credit_balance_pkey" PRIMARY KEY ("partner_id")
);

-- CreateTable
CREATE TABLE "partner_credit_ledger" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_credit_ledger_idempotency_key_key" ON "partner_credit_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "partner_credit_ledger_partner_id_created_at_idx" ON "partner_credit_ledger"("partner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "partner_credit_ledger_reference_type_reference_id_idx" ON "partner_credit_ledger"("reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "partner_credit_balance" ADD CONSTRAINT "partner_credit_balance_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_credit_ledger" ADD CONSTRAINT "partner_credit_ledger_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
