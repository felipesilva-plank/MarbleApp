-- CreateEnum
CREATE TYPE "PieceKind" AS ENUM ('slab', 'remnant');

-- CreateEnum
CREATE TYPE "RemnantOrigin" AS ENUM ('offcut', 'rejected');

-- CreateEnum
CREATE TYPE "PieceStatus" AS ENUM ('available', 'reserved', 'partially_used', 'consumed', 'scrapped');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('owner', 'member');

-- CreateTable
CREATE TABLE "orgs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'member',
    "password_hash" TEXT NOT NULL,
    "password_salt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "color" VARCHAR(120) NOT NULL DEFAULT '',
    "finish" VARCHAR(120) NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name_folded" VARCHAR(120) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "parent_id" UUID,
    "root_id" UUID NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "kind" "PieceKind" NOT NULL,
    "remnant_origin" "RemnantOrigin",
    "status" "PieceStatus" NOT NULL DEFAULT 'available',
    "material_id" UUID,
    "length_mm" INTEGER NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "thickness_mm" INTEGER NOT NULL,
    "location" VARCHAR(120) NOT NULL DEFAULT '',
    "has_photo" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_counters" (
    "org_id" UUID NOT NULL,
    "kind" "PieceKind" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "code_counters_pkey" PRIMARY KEY ("org_id","kind")
);

-- CreateTable
CREATE TABLE "filter_presets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "query" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filter_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "materials_org_id_idx" ON "materials"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "materials_org_id_name_folded_key" ON "materials"("org_id", "name_folded");

-- CreateIndex
CREATE INDEX "pieces_org_id_root_id_idx" ON "pieces"("org_id", "root_id");

-- CreateIndex
CREATE INDEX "pieces_org_id_parent_id_idx" ON "pieces"("org_id", "parent_id");

-- CreateIndex
CREATE INDEX "pieces_org_id_status_idx" ON "pieces"("org_id", "status");

-- CreateIndex
CREATE INDEX "pieces_org_id_kind_idx" ON "pieces"("org_id", "kind");

-- CreateIndex
CREATE INDEX "pieces_org_id_material_id_idx" ON "pieces"("org_id", "material_id");

-- CreateIndex
CREATE INDEX "pieces_org_id_created_at_idx" ON "pieces"("org_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_org_id_code_key" ON "pieces"("org_id", "code");

-- CreateIndex
CREATE INDEX "filter_presets_org_id_idx" ON "filter_presets"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "filter_presets_org_id_slug_key" ON "filter_presets"("org_id", "slug");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_counters" ADD CONSTRAINT "code_counters_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filter_presets" ADD CONSTRAINT "filter_presets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
