data "aws_ssm_parameter" "ecs_node_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
}

resource "aws_ecs_cluster" "main" {
  name = "${local.prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Service Discovery (Cloud Map) for internal service resolution
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${local.prefix}.local"
  description = "Service discovery namespace for ${local.prefix}"
  vpc         = module.vpc.vpc_id
}

# --- 1. IAM Roles (Least Privilege) ---
resource "aws_iam_role" "ecs_execution_role" {
  name = "${local.prefix}-ecs-exec-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = ["ecs-tasks.amazonaws.com", "ec2.amazonaws.com"]
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_exec_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "ecs_instance_role" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_instance_profile" "ecs_node" {
  name = "${local.prefix}-ecs-node-profile"
  role = aws_iam_role.ecs_execution_role.name
}

# --- 2. LiveKit Launch Template ---
resource "aws_launch_template" "livekit" {
  name_prefix   = "livekit-"
  image_id      = data.aws_ssm_parameter.ecs_node_ami.value
  instance_type = "t4g.small"

  iam_instance_profile { name = aws_iam_instance_profile.ecs_node.name }
  vpc_security_group_ids = [aws_security_group.livekit.id]

  # Register to ECS on boot
  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo ECS_CLUSTER=${aws_ecs_cluster.main.name} >> /etc/ecs/ecs.config
  EOF
  )
}

# --- 3. LiveKit ASG ---
resource "aws_autoscaling_group" "livekit" {
  name                = "${local.prefix}-livekit-asg"
  vpc_zone_identifier = module.vpc.public_subnets
  desired_capacity    = 1
  max_size            = 1
  min_size            = 1

  launch_template {
    id      = aws_launch_template.livekit.id
    version = "$Latest"
  }

  target_group_arns = [aws_lb_target_group.livekit.arn]

  instance_refresh {
    strategy = "Rolling"
  }

  tag {
    key                 = "Name"
    value               = "${local.prefix}-livekit-node"
    propagate_at_launch = true
  }
}

# --- 4. Capacity Provider ---
resource "aws_ecs_capacity_provider" "ec2" {
  name = "livekit-provider"
  auto_scaling_group_provider {
    auto_scaling_group_arn = aws_autoscaling_group.livekit.arn
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE_SPOT", aws_ecs_capacity_provider.ec2.name]
}