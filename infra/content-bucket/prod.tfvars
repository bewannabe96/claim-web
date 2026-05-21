# prod 환경 입력값. workspace=prod 와 함께 사용:
#   terraform workspace select prod
#   terraform apply -var-file=prod.tfvars
# workspace ↔ environment 불일치는 aws_s3_bucket precondition 이 차단.

environment = "prod"
namespace   = "claim-content-prod"

cors_allowed_origins = [
  "https://www.claim.ac",
]
