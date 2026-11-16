# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${local.prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  enable_deletion_protection       = false
  enable_http2                     = true
  enable_cross_zone_load_balancing = true

  tags = local.common_tags
}

# Target Group for Supabase Auth (GoTrue)
resource "aws_lb_target_group" "supertokens" {
  name        = "${local.prefix}-supertokens-tg"
  port        = 3567 # Keep existing port to avoid target group replacement
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health" # GoTrue health endpoint
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-supertokens-tg"
  })
}

# Target Group for Supabase Studio (Dashboard)
resource "aws_lb_target_group" "studio" {
  name        = "${local.prefix}-studio-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200,301,302,307" # Accept redirects (Studio redirects to /project/default)
  }

  deregistration_delay = 30

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-studio-tg"
  })
}

# Target Group for Kong (API Gateway)
resource "aws_lb_target_group" "kong" {
  name        = "${local.prefix}-kong-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    port                = "8001"    # Kong admin API port
    path                = "/status" # Kong built-in status endpoint
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-kong-tg"
  })
}

# PostgREST doesn't need a target group - accessed internally via Kong (service discovery)

# Target Group for NestJS Backend API
resource "aws_lb_target_group" "nestjs" {
  name        = "${local.prefix}-nestjs-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-nestjs-tg"
  })
}

# Target Group for LiveKit (WebRTC signaling)
resource "aws_lb_target_group" "livekit" {
  name        = "${local.prefix}-livekit-tg"
  port        = 7880
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "instance"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = local.common_tags
}

# HTTP Listener with routing rules
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

# Routing rule for Supabase Auth (GoTrue) health check
# GoTrue exposes /health at root, so we route /health directly to GoTrue
# Note: ALB doesn't support path rewriting, so we can't route /auth/v1/health to /health
# The health check will use /health directly
# Note: Priority 99 was manually created earlier, using 98 to avoid conflicts
resource "aws_lb_listener_rule" "supertokens_health" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 98 # Using 98 to avoid conflict with manually created priority 99

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.supertokens.arn
  }

  condition {
    path_pattern {
      values = ["/health"]
    }
  }
}

# Routing rule for Supabase Auth (GoTrue) API endpoints
# GoTrue standalone exposes endpoints at root (e.g., /signup, /token, /user, etc.)
# Since ALB doesn't support path rewriting, we route /auth/* to GoTrue
# The backend should call GoTrue at root paths, not /auth/v1/*
# Alternatively, we can add a reverse proxy (nginx) in front of GoTrue to handle path rewriting
resource "aws_lb_listener_rule" "supertokens" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 101

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.supertokens.arn
  }

  condition {
    path_pattern {
      values = ["/auth", "/auth/*"]
    }
  }
}

# Routing rule for Kong (API Gateway) - routes API requests through Kong
# Split into 2 rules because ALB limits to 5 condition values per rule
resource "aws_lb_listener_rule" "kong_rest_auth" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.kong.arn
  }

  condition {
    path_pattern {
      values = ["/rest", "/rest/*", "/auth", "/auth/*"]
    }
  }
}

resource "aws_lb_listener_rule" "kong_storage_realtime" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 11

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.kong.arn
  }

  condition {
    path_pattern {
      values = ["/storage", "/storage/*", "/realtime", "/realtime/*"]
    }
  }
}

# Routing rules for Supabase Studio (Dashboard)
# Split into multiple rules due to ALB 5-condition limit
# Lower priority so Kong routes are checked first

resource "aws_lb_listener_rule" "studio_main" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 50

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.studio.arn
  }

  condition {
    path_pattern {
      values = ["/", "/project", "/project/*"]
    }
  }
}

resource "aws_lb_listener_rule" "studio_static" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 51

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.studio.arn
  }

  condition {
    path_pattern {
      values = ["/_next/*", "/api/*", "/img/*", "/favicon.ico"]
    }
  }
}

# Routing rule for LiveKit - forward /rtc, /rtc/*, /twirp/*, /agent paths
# LiveKit uses /rtc for WebRTC signaling, /twirp/* for gRPC-Web API calls
# /agent is used by LiveKit Agents SDK for worker registration
resource "aws_lb_listener_rule" "livekit" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.livekit.arn
  }

  condition {
    path_pattern {
      values = ["/rtc", "/rtc/*", "/twirp/*", "/agent", "/agent/*"]
    }
  }
}

# Routing rule for NestJS Backend API
# Routes /api/v1/* to the NestJS backend service
resource "aws_lb_listener_rule" "nestjs" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.nestjs.arn
  }

  condition {
    path_pattern {
      values = ["/api/v1", "/api/v1/*"]
    }
  }
}
