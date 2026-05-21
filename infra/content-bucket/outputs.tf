output "environment" {
  description = "현재 적용된 환경 식별자 (var.environment = terraform.workspace)."
  value       = var.environment
}

output "bucket_name" {
  description = <<-EOT
    실제 적용된 버킷명 (`<account_id>-<region>-<namespace>` 패턴).
    Vercel env `S3_BUCKET_CONTENT` 에 박을 값.
  EOT
  value       = aws_s3_bucket.content.bucket
}

output "bucket_arn" {
  description = "버킷 ARN. 외부 IAM 정책 (Resource: \"<bucket_arn>/<prefix>*\") 작성에 필요."
  value       = aws_s3_bucket.content.arn
}

output "bucket_region" {
  description = "버킷이 생성된 region."
  value       = data.aws_region.current.name
}

output "public_base_url" {
  description = <<-EOT
    공개 GET prefix 의 base URL. virtual-hosted style.
    예: 키 `partners/avatar/abc/xyz.jpg` 는 `<public_base_url>/partners/avatar/abc/xyz.jpg`.
    CloudFront 얹는 시점에 이 값을 도메인으로 교체.
  EOT
  value       = "https://${aws_s3_bucket.content.bucket}.s3.${data.aws_region.current.name}.amazonaws.com"
}

output "public_read_prefixes" {
  description = "공개 GET 허용 prefix 목록 (passthrough)."
  value       = var.public_read_prefixes
}

output "app_object_resource_arns" {
  description = <<-EOT
    외부 IAM 정책 Resource 필드에 그대로 넣을 ARN 목록.
    public_read_prefixes 의 각 prefix 마다 `<bucket_arn>/<prefix>*` 형태.
  EOT
  value       = local.public_read_resources
}

output "next_steps" {
  description = "셋업 후 다음 단계 안내"
  value       = <<-EOT

    ✓ Environment: ${var.environment} (workspace: ${terraform.workspace})
    ✓ Bucket: ${aws_s3_bucket.content.bucket} (${data.aws_region.current.name})
    ✓ Public base URL: https://${aws_s3_bucket.content.bucket}.s3.${data.aws_region.current.name}.amazonaws.com
    ✓ Public read prefixes: ${join(", ", var.public_read_prefixes)}
    ✓ CORS origins: ${join(", ", var.cors_allowed_origins)}

    다음 단계:
      1) 외부에서 IAM user / policy 생성 (이 stack 범위 외):
           Resource 에 다음 ARN 사용 ↓
${join("\n", [for r in local.public_read_resources : "             - ${r}"])}
           Action: s3:PutObject / s3:GetObject / s3:HeadObject / s3:DeleteObject

      2) Vercel env 등록 (${var.environment} scope):
           S3_BUCKET_CONTENT=${aws_s3_bucket.content.bucket}
           AWS_REGION=${data.aws_region.current.name}
           AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 는 위 1) 의 IAM user 키 사용

      3) 다른 환경 작업하려면:
           terraform workspace select <env>
           terraform apply -var-file=<env>.tfvars
  EOT
}
