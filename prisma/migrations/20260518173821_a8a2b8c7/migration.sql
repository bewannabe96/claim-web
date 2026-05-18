-- AlterTable
ALTER TABLE "partner_invitation" ADD COLUMN     "linked_auth_id" UUID;

-- CreateIndex
CREATE INDEX "partner_invitation_linked_auth_id_idx" ON "partner_invitation"("linked_auth_id");
