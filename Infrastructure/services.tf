# --- Service: Redis (for LiveKit agent dispatch) ---
resource "aws_ecs_task_definition" "redis" {
  family                   = "redis"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name         = "redis"
    image        = "redis:7-alpine"
    essential    = true
    portMappings = [{ containerPort = 6379 }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/livekit"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "redis"
      }
    }
  }])
}

resource "aws_service_discovery_service" "redis" {
  name = "redis"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

resource "aws_ecs_service" "redis" {
  name            = "redis"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.redis.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.redis.arn
  }

  wait_for_steady_state = false
}

# --- Service: LiveKit (EC2) ---
resource "aws_ecs_task_definition" "livekit" {
  family                   = "livekit"
  network_mode             = "host"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  cpu                      = 1024
  memory                   = 900

  container_definitions = jsonencode([{
    name      = "livekit"
    image     = "livekit/livekit-server:latest"
    essential = true

    command = [
      "--config-body",
      "keys:\n  ${var.livekit_api_key}: ${var.livekit_secret_key}\nlog_level: info\nredis:\n  address: redis.${local.prefix}.local:6379\n"
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/livekit"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "livekit" {
  name            = "livekit"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.livekit.arn
  desired_count   = 1
  launch_type     = "EC2"

  health_check_grace_period_seconds = 600
  wait_for_steady_state             = false # Set to false to avoid blocking during deployment

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# --- Service: Supabase Auth (GoTrue) (Fargate) ---
resource "aws_ecs_task_definition" "supertokens" {
  family                   = "supertokens"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name         = "gotrue"
    image        = "supabase/gotrue:v2.184.0" # Updated to match docker-compose
    essential    = true
    portMappings = [{ containerPort = 3567 }] # Keep at 3567 to match existing target group

    environment = [
      { name = "GOTRUE_API_HOST", value = "0.0.0.0" },
      { name = "GOTRUE_API_PORT", value = "3567" }, # Keep at 3567 to match existing target group
      { name = "API_EXTERNAL_URL", value = "http://${aws_lb.main.dns_name}" },
      { name = "GOTRUE_DB_DRIVER", value = "postgres" },
      {
        name  = "GOTRUE_DB_DATABASE_URL",
        value = "postgres://neo_admin:${var.db_password}@${aws_db_instance.postgres.address}:5432/neodb?sslmode=require&options=-csearch_path%3Dauth,public,extensions"
      },
      { name = "GOTRUE_SITE_URL", value = "http://${aws_lb.main.dns_name}" },
      { name = "GOTRUE_URI_ALLOW_LIST", value = "http://${aws_lb.main.dns_name},http://${aws_lb.main.dns_name}/*" },
      { name = "GOTRUE_DISABLE_SIGNUP", value = "false" },
      { name = "GOTRUE_JWT_ADMIN_ROLES", value = "service_role" },
      { name = "GOTRUE_JWT_AUD", value = "authenticated" },
      { name = "GOTRUE_JWT_DEFAULT_GROUP_NAME", value = "authenticated" },
      { name = "GOTRUE_JWT_EXP", value = "3600" },
      { name = "GOTRUE_JWT_SECRET", value = var.gotrue_jwt_secret },
      { name = "GOTRUE_EXTERNAL_EMAIL_ENABLED", value = "true" },
      { name = "GOTRUE_EXTERNAL_PHONE_ENABLED", value = "false" },
      { name = "GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED", value = "false" },
      { name = "GOTRUE_MAILER_AUTOCONFIRM", value = "true" }, # Auto-confirm for now (no SMTP configured)

      # Google OAuth - matching docker-compose pattern
      { name = "GOTRUE_EXTERNAL_GOOGLE_ENABLED", value = var.google_oauth_client_id != "" ? "true" : "false" },
      { name = "GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID", value = var.google_oauth_client_id },
      { name = "GOTRUE_EXTERNAL_GOOGLE_SECRET", value = var.google_oauth_client_secret },
      { name = "GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI", value = "http://${aws_lb.main.dns_name}/auth/v1/callback" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/supabase-auth"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "gotrue"
      }
    }
  }])
}

resource "aws_service_discovery_service" "gotrue" {
  name = "gotrue"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

resource "aws_ecs_service" "supertokens" {
  name            = "supertokens"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.supertokens.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.gotrue.arn
    # port not needed for awsvpc mode with single container port
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.supertokens.arn
    container_name   = "gotrue"
    container_port   = 3567 # Keep at 3567 to match existing target group
  }

  health_check_grace_period_seconds = 600
  wait_for_steady_state             = false # Set to false to avoid blocking on target group replacement

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# --- Service: Kong (API Gateway) (Fargate) ---
resource "aws_ecs_task_definition" "kong" {
  family                   = "kong"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "kong"
      image     = "kong:2.8.1"
      essential = true
      portMappings = [
        { containerPort = 8000, protocol = "tcp" },
        { containerPort = 8443, protocol = "tcp" }
      ]
      # Write config to file at startup, then run Kong
      entryPoint = ["/bin/sh", "-c"]
      command = [
        "echo \"$KONG_CONFIG_CONTENT\" > /tmp/kong.yml && export KONG_DECLARATIVE_CONFIG=/tmp/kong.yml && /docker-entrypoint.sh kong docker-start"
      ]
      environment = [
        { name = "KONG_DATABASE", value = "off" },
        # Config loaded from kong.yml template file
        {
          name = "KONG_CONFIG_CONTENT"
          value = templatefile("${path.module}/kong.yml", {
            service_namespace         = local.prefix
            supabase_anon_key         = var.supabase_anon_key
            supabase_service_role_key = var.supabase_service_role_key
          })
        },
        { name = "KONG_DNS_ORDER", value = "LAST,A,CNAME" },
        { name = "KONG_PLUGINS", value = "request-transformer,cors,key-auth,acl,basic-auth" },
        { name = "KONG_NGINX_PROXY_PROXY_BUFFER_SIZE", value = "160k" },
        { name = "KONG_NGINX_PROXY_PROXY_BUFFERS", value = "64 160k" },
        { name = "KONG_PROXY_ACCESS_LOG", value = "/dev/stdout" },
        { name = "KONG_ADMIN_ACCESS_LOG", value = "/dev/stdout" },
        { name = "KONG_PROXY_ERROR_LOG", value = "/dev/stderr" },
        { name = "KONG_ADMIN_ERROR_LOG", value = "/dev/stderr" },
        { name = "KONG_ADMIN_LISTEN", value = "0.0.0.0:8001" },
        { name = "KONG_PROXY_LISTEN", value = "0.0.0.0:8000" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/supabase-auth"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "kong"
        }
      }
    }
  ])
}

resource "aws_service_discovery_service" "kong" {
  name = "kong"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

resource "aws_ecs_service" "kong" {
  name            = "kong"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.kong.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.kong.arn
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.kong.arn
    container_name   = "kong"
    container_port   = 8000
  }

  health_check_grace_period_seconds = 600
  wait_for_steady_state             = false # Set to false to avoid blocking during deployment

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# --- Service: PostgREST (REST API for PostgreSQL) (Fargate) ---
resource "aws_ecs_task_definition" "postgrest" {
  family                   = "postgrest"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name         = "postgrest"
    image        = "postgrest/postgrest:v14.1" # Updated to match docker-compose
    essential    = true
    portMappings = [{ containerPort = 3000 }]

    environment = [
      {
        name  = "PGRST_DB_URI",
        value = "postgres://neo_admin:${var.db_password}@${aws_db_instance.postgres.address}:5432/neodb?sslmode=require"
      },
      { name = "PGRST_DB_SCHEMAS", value = "public" }, # Only public schema (no storage)
      { name = "PGRST_DB_ANON_ROLE", value = "anon" },
      { name = "PGRST_JWT_SECRET", value = var.gotrue_jwt_secret },
      { name = "PGRST_DB_EXTRA_SEARCH_PATH", value = "public,extensions" },
      { name = "PGRST_APP_SETTINGS_JWT_SECRET", value = var.gotrue_jwt_secret },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/supabase-auth"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "postgrest"
      }
    }
  }])
}

resource "aws_service_discovery_service" "postgrest" {
  name = "postgrest"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

resource "aws_ecs_service" "postgrest" {
  name            = "postgrest"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.postgrest.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.postgrest.arn
    # port not needed for awsvpc mode with single container port
  }

  # No load_balancer - PostgREST is accessed internally via Kong (service discovery)

  wait_for_steady_state = false

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# --- Service: Supabase pg-meta (Database Metadata API for Studio) (Fargate) ---
resource "aws_ecs_task_definition" "pgmeta" {
  family                   = "supabase-pgmeta"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name         = "pgmeta"
    image        = "supabase/postgres-meta:v0.86.0" # From docker-compose
    essential    = true
    portMappings = [{ containerPort = 8080 }]

    environment = [
      { name = "PG_META_PORT", value = "8080" },
      { name = "PG_META_DB_HOST", value = aws_db_instance.postgres.address },
      { name = "PG_META_DB_PORT", value = "5432" },
      { name = "PG_META_DB_NAME", value = "neodb" },
      { name = "PG_META_DB_USER", value = "neo_admin" }, # Must match RDS master username
      { name = "PG_META_DB_PASSWORD", value = var.db_password },
      { name = "PG_META_DB_SSL_MODE", value = "require" },
      # Force SSL for all connections including /query endpoint
      { name = "PG_META_DB_SSL", value = "true" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/supabase-auth"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "pgmeta"
      }
    }
  }])
}

resource "aws_service_discovery_service" "pgmeta" {
  name = "pgmeta"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

resource "aws_ecs_service" "pgmeta" {
  name            = "supabase-pgmeta"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.pgmeta.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.pgmeta.arn
  }

  health_check_grace_period_seconds = 300
  wait_for_steady_state             = false

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# --- Service: Supabase Studio (Dashboard) (Fargate) ---
resource "aws_ecs_task_definition" "studio" {
  family                   = "supabase-studio"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name         = "studio"
    image        = "supabase/studio:2025.12.17-sha-43f4f7f" # Updated to match docker-compose
    essential    = true
    portMappings = [{ containerPort = 3000 }]

    environment = [
      # Network binding - matches docker-compose
      { name = "HOSTNAME", value = "::" }, # Binds to both IPv4 and IPv6

      # pg-meta for database introspection (required for Studio to work)
      { name = "STUDIO_PG_META_URL", value = "http://pgmeta.${local.prefix}.local:8080" },

      # Base URLs - Studio connects to Kong for API calls
      { name = "SUPABASE_URL", value = "http://kong.${local.prefix}.local:8000" },
      { name = "SUPABASE_PUBLIC_URL", value = "http://${aws_lb.main.dns_name}" },

      # API Keys - matches docker-compose
      { name = "SUPABASE_ANON_KEY", value = var.supabase_anon_key },
      { name = "SUPABASE_SERVICE_KEY", value = var.supabase_service_role_key },
      { name = "AUTH_JWT_SECRET", value = var.gotrue_jwt_secret },

      # Database connection - matches docker-compose
      { name = "POSTGRES_PASSWORD", value = var.db_password },
      { name = "POSTGRES_HOST", value = aws_db_instance.postgres.address },
      { name = "POSTGRES_PORT", value = "5432" },
      { name = "POSTGRES_DB", value = "neodb" },
      { name = "POSTGRES_USER", value = "neo_admin" }, # Must match RDS master username
      { name = "POSTGRES_SSL_MODE", value = "require" },

      # Studio configuration - matches docker-compose
      { name = "DEFAULT_ORGANIZATION_NAME", value = "NEO" },
      { name = "DEFAULT_PROJECT_NAME", value = "NEO Production" },
      { name = "NEXT_PUBLIC_ENABLE_LOGS", value = "false" }, # Disable logs (no analytics service)
      { name = "NEXT_ANALYTICS_BACKEND_PROVIDER", value = "postgres" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/supabase-studio"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "studio" {
  name            = "supabase-studio"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.studio.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.studio.arn
    container_name   = "studio"
    container_port   = 3000
  }

  health_check_grace_period_seconds = 600
  wait_for_steady_state             = false # Set to false to avoid blocking during deployment

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# --- Service: AI Backend (LiveKit Agent Worker) (Fargate) ---
resource "aws_ecs_task_definition" "ai_backend" {
  family                   = "ai-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name      = "ai-backend"
    image     = "${aws_ecr_repository.ai_backend.repository_url}:latest"
    essential = true

    environment = [
      # Doppler injects all config at runtime via `doppler run --`
      { name = "DOPPLER_TOKEN", value = var.doppler_token },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/ai-backend"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ai"
      }
    }
  }])
}

resource "aws_service_discovery_service" "ai_backend" {
  name = "ai-backend"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

resource "aws_ecs_service" "ai_backend" {
  name            = "ai-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai_backend.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.ai_backend.arn
  }

  # No load_balancer - AI backend is a worker that connects outbound to LiveKit

  wait_for_steady_state = false

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# --- Service: NestJS Backend API (Fargate) ---
resource "aws_ecs_task_definition" "nestjs" {
  family                   = "nestjs"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name         = "nestjs"
    image        = "${aws_ecr_repository.nestjs.repository_url}:latest"
    essential    = true
    portMappings = [{ containerPort = 3000 }]

    environment = [
      # Doppler injects all config at runtime via `doppler run --`
      { name = "DOPPLER_TOKEN", value = var.doppler_token },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/nestjs"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "nestjs"
      }
    }
  }])
}

resource "aws_service_discovery_service" "nestjs" {
  name = "nestjs"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

resource "aws_ecs_service" "nestjs" {
  name            = "nestjs"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.nestjs.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = module.vpc.public_subnets
    security_groups  = [aws_security_group.apps.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.nestjs.arn
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.nestjs.arn
    container_name   = "nestjs"
    container_port   = 3000
  }

  health_check_grace_period_seconds = 300
  wait_for_steady_state             = false

  timeouts {
    create = "10m"
    update = "10m"
  }
}
