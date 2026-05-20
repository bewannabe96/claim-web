provider "aws" {
  region = var.aws_region
}

locals {
  name = var.project_prefix
}

resource "random_password" "shared_secret" {
  length  = 48
  special = false
}

resource "aws_lightsail_key_pair" "proxy" {
  name       = "${local.name}-key"
  public_key = file(var.ssh_public_key_path)
}

resource "aws_lightsail_static_ip" "proxy" {
  name = "${local.name}-ip"
}

resource "aws_lightsail_instance" "proxy" {
  name              = "${local.name}-instance"
  availability_zone = var.availability_zone
  blueprint_id      = var.lightsail_blueprint_id
  bundle_id         = var.lightsail_bundle_id
  key_pair_name     = aws_lightsail_key_pair.proxy.name

  user_data = templatefile("${path.module}/bootstrap.sh.tftpl", {
    shared_secret      = random_password.shared_secret.result
    user_domain        = var.domain
    static_ip          = aws_lightsail_static_ip.proxy.ip_address
    server_code_base64 = base64encode(file("${path.module}/proxy/server.mjs"))
  })

  tags = var.tags
}

resource "aws_lightsail_static_ip_attachment" "proxy" {
  static_ip_name = aws_lightsail_static_ip.proxy.name
  instance_name  = aws_lightsail_instance.proxy.name

  # instance 가 재생성되면 Lightsail 이 자동으로 attachment 를 해제하는데,
  # terraform 은 instance_name 이 동일하다 보고 변경 없음으로 판단해 re-attach API
  # 를 호출하지 않음 → static IP 가 detached 인 채로 남음. 명시적으로 instance
  # 재생성 시 attachment 도 재생성하도록 강제.
  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.proxy]
  }
}

resource "aws_lightsail_instance_public_ports" "proxy" {
  instance_name = aws_lightsail_instance.proxy.name

  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = var.allowed_ssh_cidrs
  }

  # instance 재생성 시 새 인스턴스에 firewall 규칙이 자동 적용되지 않음.
  # 명시적으로 ports 도 재생성하도록 강제.
  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.proxy]
  }
}
