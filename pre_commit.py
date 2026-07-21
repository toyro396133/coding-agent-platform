import subprocess
import sys

def run_command(command):
    try:
        result = subprocess.run(command, shell=False, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"Command '{' '.join(command)}' executed successfully.")
        return result
    except subprocess.CalledProcessError as e:
        print(f"Error executing command '{' '.join(command)}':\n{e.stderr.decode('utf-8')}")
        return e

# Just making sure Git is completely clean and tests pass!
git_result = run_command(["git", "status", "--porcelain"])
type_check_result = run_command(["pnpm", "type-check"])

# Check both results
has_changes = isinstance(git_result, subprocess.CalledProcessError) or (hasattr(git_result, 'stdout') and git_result.stdout.decode('utf-8').strip())
type_check_failed = isinstance(type_check_result, subprocess.CalledProcessError)

if has_changes:
    print("Error: Git working directory has uncommitted changes:")
    if hasattr(git_result, 'stdout'):
        print(git_result.stdout.decode('utf-8'))
    sys.exit(1)

if type_check_failed:
    print("Error: Type checking failed")
    if hasattr(type_check_result, 'stderr'):
        print(type_check_result.stderr.decode('utf-8'))
    sys.exit(1)

print("Pre commit verification done!")
