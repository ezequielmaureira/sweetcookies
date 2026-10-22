-- Sweet Click Challenge: estado "despublicado" (1/2).
-- Solo agrega un valor al enum, en su propia migración (PostgreSQL no permite
-- usar un valor nuevo de un enum en la misma transacción que lo crea).
-- No modifica ningún dato.
ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'UNPUBLISHED';
