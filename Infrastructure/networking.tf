module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.1"

  name = "${local.prefix}-vpc"
  cidr = "10.0.0.0/16"

  azs              = ["us-east-1a", "us-east-1b"]
  public_subnets   = ["10.0.101.0/24", "10.0.102.0/24"]
  database_subnets = ["10.0.103.0/24", "10.0.104.0/24"]

  create_database_subnet_route_table = true

  create_database_subnet_group = true

  enable_nat_gateway      = false
  enable_vpn_gateway      = false
  map_public_ip_on_launch = true
}