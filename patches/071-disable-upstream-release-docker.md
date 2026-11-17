# 071 Do not run the upstream Docker release here

`.github/workflows/release-docker.yaml` is Cal.diy's own image release. It runs on every `v*` tag and on manual dispatch, and publishes the upstream image to Docker Hub and the registry using upstream secrets.

SeatRota publishes its image with `.github/workflows/release.yml` (`ghcr.io/seatrota/seatrota`). Without this gate, pushing a SeatRota `v*` tag would also start the upstream release.

The patch keeps the Prepare job from running unless `github.repository` is `calcom/cal.diy`. Every release job needs Prepare, so they stay skipped as well.
