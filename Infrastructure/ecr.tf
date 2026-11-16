resource "aws_ecr_repository" "nestjs" {
  name                 = "${local.prefix}-nestjs-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecr_repository" "ai_backend" {
  name                 = "${local.prefix}-ai-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}