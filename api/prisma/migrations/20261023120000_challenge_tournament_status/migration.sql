-- Sweet Click Challenge → torneos administrables (1/2).
-- Solo agrega dos valores al enum de estado. Va en una migración propia porque
-- PostgreSQL no permite usar un valor nuevo de un enum en la misma transacción
-- que lo crea (la migración 2/2 lo usa como valor por defecto).
-- No modifica ningún dato.
ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
