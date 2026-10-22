-- Sweet Click Challenge: invitaciones entre amigos y partidas sin duplicados.
-- Solo CREA tablas nuevas (enlaces, visitas y registros referidos) y agrega una
-- columna opcional a challenge_games. No modifica ni borra datos existentes.

-- AlterTable
ALTER TABLE "challenge_games" ADD COLUMN     "client_request_id" VARCHAR(40);

-- CreateTable
CREATE TABLE "challenge_invites" (
    "id" VARCHAR(40) NOT NULL,
    "edition_id" VARCHAR(40) NOT NULL,
    "participant_id" VARCHAR(40) NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_invite_visits" (
    "id" VARCHAR(40) NOT NULL,
    "invite_id" VARCHAR(40) NOT NULL,
    "visitor_hash" VARCHAR(64) NOT NULL,
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_invite_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_referrals" (
    "id" VARCHAR(40) NOT NULL,
    "edition_id" VARCHAR(40) NOT NULL,
    "invite_id" VARCHAR(40) NOT NULL,
    "referrer_id" VARCHAR(40) NOT NULL,
    "referred_id" VARCHAR(40) NOT NULL,
    "same_connection" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "challenge_invites_code_key" ON "challenge_invites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_invites_edition_id_participant_id_key" ON "challenge_invites"("edition_id", "participant_id");

-- CreateIndex
CREATE INDEX "challenge_invite_visits_invite_id_ip_hash_idx" ON "challenge_invite_visits"("invite_id", "ip_hash");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_invite_visits_invite_id_visitor_hash_key" ON "challenge_invite_visits"("invite_id", "visitor_hash");

-- CreateIndex
CREATE INDEX "challenge_referrals_invite_id_idx" ON "challenge_referrals"("invite_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_referrals_edition_id_referred_id_key" ON "challenge_referrals"("edition_id", "referred_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_games_participant_id_client_request_id_key" ON "challenge_games"("participant_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "challenge_invites" ADD CONSTRAINT "challenge_invites_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "challenge_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_invites" ADD CONSTRAINT "challenge_invites_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "challenge_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_invite_visits" ADD CONSTRAINT "challenge_invite_visits_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "challenge_invites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_referrals" ADD CONSTRAINT "challenge_referrals_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "challenge_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_referrals" ADD CONSTRAINT "challenge_referrals_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "challenge_invites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_referrals" ADD CONSTRAINT "challenge_referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "challenge_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_referrals" ADD CONSTRAINT "challenge_referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "challenge_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- El autorreferido nunca se guarda (el servidor también lo impide).
ALTER TABLE "challenge_referrals" ADD CONSTRAINT "challenge_referrals_not_self" CHECK ("referrer_id" <> "referred_id");
