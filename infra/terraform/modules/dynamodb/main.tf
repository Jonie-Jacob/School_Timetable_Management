locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

resource "aws_dynamodb_table" "websocket_connections" {
  name         = "${local.name_prefix}-ws-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  attribute {
    name = "schoolId"
    type = "S"
  }

  global_secondary_index {
    name            = "schoolId-index"
    hash_key        = "schoolId"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = { Name = "${local.name_prefix}-ws-connections" }
}
