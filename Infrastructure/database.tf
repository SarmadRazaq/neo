resource "aws_db_instance" "postgres" {
  identifier        = "${local.prefix}-db"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "neodb"
  username = "neo_admin"
  password = var.db_password

  # Use the existing database subnet group from VPC module
  # AWS doesn't allow changing subnet groups on existing instances
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  publicly_accessible    = true
  vpc_security_group_ids = [aws_security_group.db.id]

  skip_final_snapshot = true

  # Prevent subnet group changes on existing instances
  lifecycle {
    ignore_changes = [db_subnet_group_name]
  }

  tags = local.common_tags
}

# Note: Auth schema permissions were granted manually using setup_auth_schema.sh
# The null_resource was removed because:
# 1. It requires psql to be installed in the CI/CD environment
# 2. Database connection from CI/CD may timeout due to network restrictions
# 3. The schema was already created manually
# If you need to recreate, run: Infrastructure/setup_auth_schema.sh manually