output "connection_string" {
  value     = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.main.endpoint}/${var.db_name}"
  sensitive = true
}

output "endpoint" {
  value = aws_db_instance.main.endpoint
}

output "db_instance_arn" {
  value = aws_db_instance.main.arn
}

output "db_instance_id" {
  value = aws_db_instance.main.id
}
