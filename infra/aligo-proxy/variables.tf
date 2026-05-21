variable "aws_region" {
  description = "AWS region (Lightsail 지원 리전)"
  type        = string
  default     = "ap-northeast-2"
}

variable "availability_zone" {
  description = "리전 내 AZ"
  type        = string
  default     = "ap-northeast-2a"
}

variable "project_prefix" {
  description = "모든 리소스 이름 prefix"
  type        = string
  default     = "aligo-proxy"
}

variable "lightsail_blueprint_id" {
  description = "Lightsail OS blueprint"
  type        = string
  default     = "ubuntu_22_04"
}

variable "lightsail_bundle_id" {
  description = "인스턴스 plan. micro_3_0 = 1GB RAM / 2vCPU / 40GB SSD."
  type        = string
  default     = "micro_3_0"
}

variable "ssh_public_key_path" {
  description = "SSH 공개키 경로 (예: ~/.ssh/aligo-proxy.pub). 사전에 ssh-keygen 으로 생성."
  type        = string
}

variable "allowed_ssh_cidrs" {
  description = "SSH(22) 허용 CIDR. 기본 0.0.0.0/0 — 운영에선 본인 IP 만 허용 강력 권장."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "domain" {
  description = "프록시 호스트네임 (예: aligo-proxy.example.com). 비워두면 <ip>.nip.io 자동 사용."
  type        = string
  default     = ""
}

variable "tags" {
  description = "모든 리소스에 적용할 태그"
  type        = map(string)
  default = {
    Project   = "claim-web"
    Component = "aligo-proxy"
    ManagedBy = "terraform"
  }
}
