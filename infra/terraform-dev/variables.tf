variable "db_name" {
  type    = string
  default = "timetable_dev"
}

variable "db_username" {
  type    = string
  default = "timetable_admin"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "cognito_callback_urls" {
  type    = list(string)
  default = ["https://localhost:3000/callback"]
}

variable "cognito_logout_urls" {
  type    = list(string)
  default = ["https://localhost:3000/logout"]
}

variable "domain_name" {
  type    = string
  default = ""
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "alarm_email" {
  type    = string
  default = ""
}
