locals {
  # Naming convention: neo-production-resource
  prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = "ZenapticLabs"
  }
}