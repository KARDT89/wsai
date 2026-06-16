import { OpenAIAgentsProvider } from "@corsair-dev/mcp";
import { Agent, run, tool } from "@openai/agents";
import { corsair } from "@/server/corsair/corsair";

export async function runWsaiAgent(prompt: string) {
  const provider = new OpenAIAgentsProvider();

  const tools = provider.build({
    corsair,
    tool,
  });

  const agent = new Agent({
    name: "wsai-agent",
    model: "gpt-4.1",
    instructions: `
You are the WSAI workspace agent.

You have access to Corsair tools.

Always use:
- list_operations to discover available APIs
- get_schema before calling an operation
- run_script to execute Corsair operations

For destructive actions like sending emails, deleting, archiving, creating events, or modifying GitHub issues, explain what you plan to do first.
    `,
    tools,
  });

  const result = await run(agent, prompt);

  return result.finalOutput;
}