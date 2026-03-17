output "frontend_bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "frontend_bucket_regional_domain_name" {
  value = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "export_bucket_arn" {
  value = aws_s3_bucket.export.arn
}

output "export_bucket_name" {
  value = aws_s3_bucket.export.id
}
