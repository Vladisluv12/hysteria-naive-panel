@test "install.sh: no systemctl stop unattended-upgrades" {
  run grep -c "systemctl stop unattended-upgrades" install.sh
  [ "$status" -eq 1 ]
}

@test "install.sh: no systemctl disable unattended-upgrades" {
  run grep -c "systemctl disable unattended-upgrades" install.sh
  [ "$status" -eq 1 ]
}

@test "install.sh: no pkill -9 unattended-upgrades" {
  run grep -c "pkill -9 unattended-upgrades" install.sh
  [ "$status" -eq 1 ]
}

@test "install.sh: no needrestart auto-mode" {
  run grep "'a'" install.sh
  [ "$status" -eq 1 ]
}

@test "install.sh: supports Ubuntu 26.04" {
  run grep -E "22\.04\|24\.04\|26\.04" install.sh
  [ "$status" -eq 0 ]
}

@test "install.sh: has nvm fallback" {
  run grep -c "nvm-sh/nvm" install.sh
  [ "$status" -eq 0 ]
}

@test "install_naiveproxy.sh: no systemctl stop unattended-upgrades" {
  run grep -c "systemctl stop unattended-upgrades" panel/scripts/install_naiveproxy.sh
  [ "$status" -eq 1 ]
}

@test "install_naiveproxy.sh: no systemctl disable unattended-upgrades" {
  run grep -c "systemctl disable unattended-upgrades" panel/scripts/install_naiveproxy.sh
  [ "$status" -eq 1 ]
}

@test "install_naiveproxy.sh: no pkill -9 unattended-upgrades" {
  run grep -c "pkill -9 unattended-upgrades" panel/scripts/install_naiveproxy.sh
  [ "$status" -eq 1 ]
}

@test "install_naiveproxy.sh: no needrestart" {
  run grep -c "needrestart" panel/scripts/install_naiveproxy.sh
  [ "$status" -eq 1 ]
}
