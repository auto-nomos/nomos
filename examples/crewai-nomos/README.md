# crewai-nomos

CrewAI integration: each `Task` runs as a Nomos-authorized agent. The
Crew context carries the parent UCAN chain so children inherit (and
attenuate) trust automatically.

```python
from crewai import Agent, Task, Crew
from nomos import AuthGuard, fork_child, read_parent_chain_from_env

guard = AuthGuard(api_key=..., pdp_url=...)

class NomosTask(Task):
    """Wraps execute() so every tool call goes through Nomos with the
    current chain context."""
    def execute_sync(self, *args, **kwargs):
        chain = read_parent_chain_from_env().chain
        ucan = chain[-1] if chain else self.ucan
        decision = guard.authorize(
            ucan=ucan,
            command=self.tool_command,
            resource=self.tool_resource,
        )
        assert decision.allow, decision.reason
        return super().execute_sync(*args, **kwargs)
```

Forking a sub-task uses `fork_child()` and stamps env vars onto the
child Crew's process or sub-agent thread (CrewAI 0.30+ supports custom
worker spawn hooks for env propagation).
