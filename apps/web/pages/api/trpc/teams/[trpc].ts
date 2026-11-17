import { createNextApiHandler } from "@calcom/trpc/server/createNextApiHandler";
import { teamsRouter } from "@seatrota/teams-core/router";

export default createNextApiHandler(teamsRouter);
