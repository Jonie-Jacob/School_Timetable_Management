output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "db_subnet_ids" {
  value = aws_subnet.db[*].id
}

output "lambda_sg_id" {
  value = aws_security_group.lambda.id
}

output "fargate_sg_id" {
  value = aws_security_group.fargate.id
}

output "rds_sg_id" {
  value = aws_security_group.rds.id
}
