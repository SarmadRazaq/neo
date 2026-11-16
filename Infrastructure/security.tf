# 1. Load Balancer SG (Open to World)
resource "aws_security_group" "alb" {
  name        = "${local.prefix}-alb-sg"
  description = "Allow HTTP/HTTPS from internet"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [description]
  }
}

# 2. Application SG (NestJS/AI/Supabase Auth)
resource "aws_security_group" "apps" {
  name        = "${local.prefix}-app-sg"
  description = "Allow traffic from ALB, internal services, and whitelisted IPs"
  vpc_id      = module.vpc.vpc_id

  # Allow from ALB
  ingress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    security_groups = [aws_security_group.alb.id]
  }

  # Allow internal access from VPC CIDR (covers EC2, ECS, and DB)
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }

  # Allow public access from whitelisted IPs (for Supabase Auth/GoTrue port 3567)
  ingress {
    from_port        = 3567
    to_port          = 3567
    protocol         = "tcp"
    cidr_blocks      = var.allowed_public_ips
    ipv6_cidr_blocks = var.allowed_public_ipv6s
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [description]
  }
}

# 3. Database SG (Private-ish)
resource "aws_security_group" "db" {
  name        = "${local.prefix}-db-sg"
  description = "Allow traffic from Apps, LiveKit, internal VPC, and whitelisted IPs"
  vpc_id      = module.vpc.vpc_id

  # Allow internal access from VPC CIDR (covers EC2, ECS, and all internal services)
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }

  # Allow public access from whitelisted IPs
  ingress {
    from_port        = 5432
    to_port          = 5432
    protocol         = "tcp"
    cidr_blocks      = var.allowed_public_ips
    ipv6_cidr_blocks = var.allowed_public_ipv6s
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [description]
  }
}

# 4. LiveKit SG (WebRTC Needs)
resource "aws_security_group" "livekit" {
  name        = "${local.prefix}-livekit-sg"
  description = "Allow WebRTC UDP traffic, internal access, and whitelisted public IPs"
  vpc_id      = module.vpc.vpc_id

  # Allow internal access from VPC CIDR (covers EC2, ECS, and DB)
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }

  # UDP for Media - allow from anywhere (WebRTC clients need this for peer connections)
  ingress {
    from_port   = 50000
    to_port     = 60000
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "WebRTC media - open for client connections"
  }

  # TCP for Signaling - allow from anywhere (WebRTC clients need this)
  ingress {
    from_port   = 7880
    to_port     = 7880
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "WebRTC signaling - open for client connections"
  }

  # SSH - only from whitelisted IPs
  ingress {
    from_port        = 22
    to_port          = 22
    protocol         = "tcp"
    cidr_blocks      = var.allowed_public_ips
    ipv6_cidr_blocks = var.allowed_public_ipv6s
    description      = "SSH access from whitelisted IPs only"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [description]
  }
}
