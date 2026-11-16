# --- Developer IAM Users with Read-Only Access ---

# Get current AWS account ID for policy ARNs
data "aws_caller_identity" "current" {}

# --- IAM Policy: Read-Only Access to NEO Resources ---
resource "aws_iam_policy" "developer_readonly" {
  name        = "${local.prefix}-developer-readonly"
  description = "Read-only access to NEO infrastructure resources"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ECS - View clusters, services, tasks, task definitions
      {
        Sid    = "ECSReadOnly"
        Effect = "Allow"
        Action = [
          "ecs:Describe*",
          "ecs:List*",
          "ecs:GetTaskProtection"
        ]
        Resource = "*"
      },
      # ECR - View repositories and images
      {
        Sid    = "ECRReadOnly"
        Effect = "Allow"
        Action = [
          "ecr:Describe*",
          "ecr:List*",
          "ecr:GetRepositoryPolicy",
          "ecr:GetLifecyclePolicy",
          "ecr:GetLifecyclePolicyPreview",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      # CloudWatch Logs - View and read logs
      {
        Sid    = "CloudWatchLogsReadOnly"
        Effect = "Allow"
        Action = [
          "logs:Describe*",
          "logs:Get*",
          "logs:List*",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:FilterLogEvents"
        ]
        Resource = "*"
      },
      # CloudWatch Metrics - View metrics and dashboards
      {
        Sid    = "CloudWatchMetricsReadOnly"
        Effect = "Allow"
        Action = [
          "cloudwatch:Describe*",
          "cloudwatch:Get*",
          "cloudwatch:List*"
        ]
        Resource = "*"
      },
      # RDS - View database instances and status
      {
        Sid    = "RDSReadOnly"
        Effect = "Allow"
        Action = [
          "rds:Describe*",
          "rds:List*"
        ]
        Resource = "*"
      },
      # EC2/VPC - View instances, security groups, VPCs, subnets
      {
        Sid    = "EC2VPCReadOnly"
        Effect = "Allow"
        Action = [
          "ec2:Describe*",
          "ec2:GetLaunchTemplateData"
        ]
        Resource = "*"
      },
      # Elastic Load Balancing - View load balancers, target groups, listeners
      {
        Sid    = "ELBReadOnly"
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:Describe*"
        ]
        Resource = "*"
      },
      # Auto Scaling - View ASGs and launch configurations
      {
        Sid    = "AutoScalingReadOnly"
        Effect = "Allow"
        Action = [
          "autoscaling:Describe*"
        ]
        Resource = "*"
      },
      # Service Discovery (Cloud Map) - View namespaces and services
      {
        Sid    = "ServiceDiscoveryReadOnly"
        Effect = "Allow"
        Action = [
          "servicediscovery:Get*",
          "servicediscovery:List*",
          "servicediscovery:DiscoverInstances"
        ]
        Resource = "*"
      },
      # Application Auto Scaling - View scaling policies
      {
        Sid    = "AppAutoScalingReadOnly"
        Effect = "Allow"
        Action = [
          "application-autoscaling:Describe*"
        ]
        Resource = "*"
      },
      # Resource Groups - For console organization
      {
        Sid    = "ResourceGroupsReadOnly"
        Effect = "Allow"
        Action = [
          "resource-groups:Get*",
          "resource-groups:List*",
          "resource-groups:Search*"
        ]
        Resource = "*"
      },
      # Tag Editor - View tags across resources
      {
        Sid    = "TagReadOnly"
        Effect = "Allow"
        Action = [
          "tag:Get*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

# --- IAM Group: Developers ---
resource "aws_iam_group" "developers" {
  name = "${local.prefix}-developers"
}

resource "aws_iam_group_policy_attachment" "developers_readonly" {
  group      = aws_iam_group.developers.name
  policy_arn = aws_iam_policy.developer_readonly.arn
}

# --- IAM Users ---
resource "aws_iam_user" "developers" {
  for_each = toset(var.developer_usernames)

  name          = each.value
  force_destroy = true

  tags = merge(local.common_tags, {
    Role = "Developer"
  })
}

resource "aws_iam_user_group_membership" "developers" {
  for_each = toset(var.developer_usernames)

  user   = aws_iam_user.developers[each.key].name
  groups = [aws_iam_group.developers.name]
}

# Access keys for CLI/SDK access
resource "aws_iam_access_key" "developers" {
  for_each = toset(var.developer_usernames)

  user = aws_iam_user.developers[each.key].name
}
