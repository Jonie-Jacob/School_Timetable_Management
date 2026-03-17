output "table_arn" {
  value = aws_dynamodb_table.websocket_connections.arn
}

output "table_name" {
  value = aws_dynamodb_table.websocket_connections.name
}
