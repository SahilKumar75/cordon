demoDir=$(cd "$(dirname "$0")" && pwd)
repoDir=$(dirname "$demoDir")
envFile="$demoDir/demo.env"
[ -f "$envFile" ] || envFile="$demoDir/demo.env.example"
set -a
. "$envFile"
set +a
case "$(node --version)" in
  v22.*) ;;
  *) echo "Node 22 is required, run: source ~/.nvm/nvm.sh && nvm use 22" >&2; exit 1 ;;
esac
waitFor() {
  tries=0
  until curl -fs "$1" > /dev/null; do
    tries=$((tries + 1))
    [ "$tries" -lt 50 ] || { echo "timed out waiting for $1" >&2; exit 1; }
    sleep 0.2
  done
}
