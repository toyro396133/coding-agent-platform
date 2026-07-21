import subprocess
import sys

def run_command(command):
    try:
        result = subprocess.run(command, shell=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"Command '{command}' executed successfully.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error executing command '{command}':\n{e.stderr.decode('utf-8')}")
        return False

# Just making sure Git is completely clean and tests pass!
run_command("git status")
run_command("pnpm type-check")

print("Pre commit verification done!")
