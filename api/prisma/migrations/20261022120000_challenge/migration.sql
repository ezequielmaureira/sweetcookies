-- Sweet Click Challenge: campeonato semanal (ediciones de prueba y oficiales,
-- participantes por @ de Instagram, partidas, descalificaciones, premio del
-- ganador y registro de acciones del admin). Solo CREA tablas nuevas: no toca
-- productos, pedidos, vouchers ni ningún dato existente.

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'PAUSED', 'FINISHED', 'RESULTS_PUBLISHED');

-- CreateEnum
CREATE TYPE "ChallengeGameStatus" AS ENUM ('STARTED', 'FINISHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ChallengeSuspicion" AS ENUM ('NONE', 'LOW', 'HIGH');

-- CreateEnum
CREATE TYPE "ChallengeReview" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChallengeClaimStatus" AS ENUM ('PENDING', 'CLAIMED', 'CONTACTED', 'DELIVERED');

-- CreateTable
CREATE TABLE "challenge_editions" (
    "id" VARCHAR(40) NOT NULL,
    "is_test" BOOLEAN NOT NULL DEFAULT true,
    "number" INTEGER NOT NULL,
    "week_start" VARCHAR(10) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "game_duration_ms" INTEGER NOT NULL DEFAULT 15000,
    "attempts" INTEGER NOT NULL DEFAULT 3,
    "prize" VARCHAR(120) NOT NULL DEFAULT 'Caja de 3 cookies',
    "paused_at" TIMESTAMP(3),
    "paused_by" VARCHAR(64),
    "pause_reason" VARCHAR(300),
    "winner_participant_id" VARCHAR(40),
    "winner_game_id" VARCHAR(40),
    "winner_score" INTEGER,
    "results_published_at" TIMESTAMP(3),
    "results_published_by" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_participants" (
    "id" VARCHAR(40) NOT NULL,
    "instagram" VARCHAR(30) NOT NULL,
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "terms_version" VARCHAR(30) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_issued_at" TIMESTAMP(3) NOT NULL,
    "ip_hash" VARCHAR(64),
    "duplicate_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_duplicate_at" TIMESTAMP(3),
    "recovery_code_hash" VARCHAR(64),
    "recovery_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_games" (
    "id" VARCHAR(40) NOT NULL,
    "edition_id" VARCHAR(40) NOT NULL,
    "participant_id" VARCHAR(40) NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "ChallengeGameStatus" NOT NULL DEFAULT 'STARTED',
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "ip_hash" VARCHAR(64),
    "score" INTEGER,
    "cookies" INTEGER,
    "taps_received" INTEGER,
    "taps_ignored" INTEGER,
    "untrusted_taps" INTEGER,
    "taps" INTEGER[],
    "flags" TEXT[],
    "suspicion" "ChallengeSuspicion" NOT NULL DEFAULT 'NONE',
    "review" "ChallengeReview" NOT NULL DEFAULT 'NONE',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" VARCHAR(64),
    "review_reason" VARCHAR(300),

    CONSTRAINT "challenge_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_disqualifications" (
    "id" VARCHAR(40) NOT NULL,
    "edition_id" VARCHAR(40) NOT NULL,
    "participant_id" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "created_by" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_disqualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_prize_claims" (
    "id" VARCHAR(40) NOT NULL,
    "edition_id" VARCHAR(40) NOT NULL,
    "participant_id" VARCHAR(40) NOT NULL,
    "game_id" VARCHAR(40) NOT NULL,
    "status" "ChallengeClaimStatus" NOT NULL DEFAULT 'PENDING',
    "name" VARCHAR(60),
    "phone" VARCHAR(16),
    "claimed_at" TIMESTAMP(3),
    "contacted_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_prize_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_admin_actions" (
    "id" VARCHAR(40) NOT NULL,
    "edition_id" VARCHAR(40),
    "participant_id" VARCHAR(40),
    "game_id" VARCHAR(40),
    "action" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(300),
    "admin_user_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challenge_editions_starts_at_idx" ON "challenge_editions"("starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_editions_week_start_is_test_key" ON "challenge_editions"("week_start", "is_test");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_editions_is_test_number_key" ON "challenge_editions"("is_test", "number");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_participants_instagram_key" ON "challenge_participants"("instagram");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_participants_token_hash_key" ON "challenge_participants"("token_hash");

-- CreateIndex
CREATE INDEX "challenge_participants_ip_hash_idx" ON "challenge_participants"("ip_hash");

-- CreateIndex
CREATE INDEX "challenge_games_edition_id_status_score_idx" ON "challenge_games"("edition_id", "status", "score");

-- CreateIndex
CREATE INDEX "challenge_games_edition_id_review_idx" ON "challenge_games"("edition_id", "review");

-- CreateIndex
CREATE INDEX "challenge_games_edition_id_ip_hash_idx" ON "challenge_games"("edition_id", "ip_hash");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_games_participant_id_edition_id_attempt_number_key" ON "challenge_games"("participant_id", "edition_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_disqualifications_edition_id_participant_id_key" ON "challenge_disqualifications"("edition_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_prize_claims_edition_id_key" ON "challenge_prize_claims"("edition_id");

-- CreateIndex
CREATE INDEX "challenge_prize_claims_participant_id_idx" ON "challenge_prize_claims"("participant_id");

-- CreateIndex
CREATE INDEX "challenge_admin_actions_edition_id_created_at_idx" ON "challenge_admin_actions"("edition_id", "created_at");

-- AddForeignKey
ALTER TABLE "challenge_games" ADD CONSTRAINT "challenge_games_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "challenge_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_games" ADD CONSTRAINT "challenge_games_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "challenge_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_disqualifications" ADD CONSTRAINT "challenge_disqualifications_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "challenge_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_disqualifications" ADD CONSTRAINT "challenge_disqualifications_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "challenge_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_prize_claims" ADD CONSTRAINT "challenge_prize_claims_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "challenge_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_prize_claims" ADD CONSTRAINT "challenge_prize_claims_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "challenge_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_admin_actions" ADD CONSTRAINT "challenge_admin_actions_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "challenge_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que la base garantiza aunque falle la validación de la API.
ALTER TABLE "challenge_games" ADD CONSTRAINT "challenge_games_attempt_number_positive" CHECK ("attempt_number" >= 1);
ALTER TABLE "challenge_games" ADD CONSTRAINT "challenge_games_score_range" CHECK ("score" IS NULL OR "score" >= 0);
ALTER TABLE "challenge_games" ADD CONSTRAINT "challenge_games_finished_has_score" CHECK ("status" <> 'FINISHED' OR ("score" IS NOT NULL AND "finished_at" IS NOT NULL));
ALTER TABLE "challenge_editions" ADD CONSTRAINT "challenge_editions_window" CHECK ("ends_at" > "starts_at");
ALTER TABLE "challenge_editions" ADD CONSTRAINT "challenge_editions_attempts_positive" CHECK ("attempts" >= 1);
ALTER TABLE "challenge_editions" ADD CONSTRAINT "challenge_editions_number_positive" CHECK ("number" >= 1);
ALTER TABLE "challenge_prize_claims" ADD CONSTRAINT "challenge_prize_claims_claimed_has_data" CHECK ("status" = 'PENDING' OR "claimed_at" IS NULL OR ("name" IS NOT NULL AND "phone" IS NOT NULL));
