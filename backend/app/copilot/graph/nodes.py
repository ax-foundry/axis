import logging
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel
from pydantic_graph import BaseNode, End, GraphRunContext

from app.copilot.graph.deps import GraphDeps
from app.copilot.graph.state import CopilotState, ExecutionPlan, PlanStep, RequestComplexity

logger = logging.getLogger("axis.copilot.graph.nodes")


# Structured output types for LLM responses
class AnalysisResult(BaseModel):
    """Result of analyzing a user request."""

    intent: str
    complexity: Literal["simple", "moderate", "complex"]
    requires_data: bool
    suggested_skills: list[str]
    can_answer_directly: bool
    direct_answer: str | None = None


class PlanResult(BaseModel):
    """Result of planning execution steps."""

    goal: str
    steps: list[dict[str, Any]]


class ReflectionResult(BaseModel):
    """Result of reflecting on output quality."""

    quality_score: float
    feedback: str
    needs_replanning: bool
    improvement_suggestions: list[str]


@dataclass
class AnalyzerNode(BaseNode[CopilotState, GraphDeps, str]):
    """Analyzes user request to determine intent and complexity.

    Routes to:
    - End[str]: If the request can be answered directly
    - PlannerNode: If the request requires planning
    """

    async def run(
        self, ctx: GraphRunContext[CopilotState, GraphDeps]
    ) -> "PlannerNode | ExecutorNode | End[str]":
        """Analyze the user request and determine next steps."""
        logger.info("=== AnalyzerNode.run START ===")
        state = ctx.state
        deps = ctx.deps
        logger.info(f"State message: {state.message[:100]}...")
        logger.info(f"Deps has_llm: {deps.has_llm}")

        logger.info("Emitting reasoning thought...")
        await deps.thought_stream.emit_reasoning(
            f"Analyzing request: {state.message[:100]}...",
            node_name="Analyzer",
        )
        logger.info("Reasoning thought emitted")

        # Get available skills
        available_skills = deps.skill_registry.list_skills()
        skill_names = [s.name for s in available_skills]
        state.available_skills = skill_names

        # Check if we have an LLM
        if not deps.has_llm:
            await deps.thought_stream.emit_error(
                "No LLM provider configured. Please configure OpenAI or Anthropic.",
                node_name="Analyzer",
            )
            return End("I need an AI provider to be configured to help with this request.")

        # Use LLM to analyze the request
        try:
            has_data = state.data is not None and len(state.data) > 0

            system_prompt = f"""You are an AI assistant analyzing user requests about evaluation data.

Available skills you can use: {', '.join(skill_names)}

Analyze the user's request and determine:
1. What is their intent?
2. How complex is this request? (simple/moderate/complex)
3. Does it require looking at the actual data values?
4. Which skills might be useful?
5. Can you answer directly without using skills?

IMPORTANT: You can ONLY answer directly (can_answer_directly=True) if the question:
- Does NOT require looking at specific data values (like asking about a specific test ID, metric scores, etc.)
- Is a general knowledge question OR a question about capabilities
- Examples of what you CANNOT answer directly: "What is the lowest metric?", "Show me results for ID X", "What's the average score?"
- Examples of what you CAN answer directly: "What skills are available?", "How does this tool work?", "What metrics can you analyze?"

If the user is asking about specific data, you MUST set can_answer_directly=False and requires_data=True.
- For specific lookups (find by ID, min/max values, specific records): suggest 'query' skill
- For general statistics and patterns: suggest 'analyze' skill
- For summaries and insights: suggest 'summarize' skill

Data context: {state.data_context}
Has data loaded: {has_data}
Number of records: {len(state.data) if has_data else 0}"""

            agent = deps.llm_provider.create_agent(
                system_prompt=system_prompt,
                result_type=AnalysisResult,
            )

            result = await agent.run(state.message)
            analysis = result.output

            # Update state with analysis
            state.intent = analysis.intent
            state.complexity = RequestComplexity(analysis.complexity)
            state.requires_data = analysis.requires_data

            await deps.thought_stream.emit_observation(
                f"Intent: {analysis.intent}\n"
                f"Complexity: {analysis.complexity}\n"
                f"Requires data: {analysis.requires_data}\n"
                f"Suggested skills: {', '.join(analysis.suggested_skills)}",
                node_name="Analyzer",
            )

            # Route based on complexity
            # Only answer directly if we DON'T need to look at data
            if (
                analysis.can_answer_directly
                and analysis.direct_answer
                and not analysis.requires_data
            ):
                await deps.thought_stream.emit_decision(
                    "Request can be answered directly without using skills.",
                    node_name="Analyzer",
                )
                state.final_response = analysis.direct_answer
                return End(analysis.direct_answer)

            if state.complexity == RequestComplexity.SIMPLE:
                # Skip planning for simple requests
                await deps.thought_stream.emit_decision(
                    "Simple request - proceeding to execution.",
                    node_name="Analyzer",
                )
                # Create a simple single-step plan
                state.plan = ExecutionPlan(
                    goal=state.intent,
                    steps=[
                        PlanStep(
                            step_number=1,
                            description="Execute the request directly",
                            skill_name=analysis.suggested_skills[0]
                            if analysis.suggested_skills
                            else None,
                        )
                    ],
                )
                return ExecutorNode()

            await deps.thought_stream.emit_decision(
                f"Complex request ({analysis.complexity}) - needs planning.",
                node_name="Analyzer",
            )
            return PlannerNode()

        except Exception as e:
            logger.error(f"Analysis failed: {e}", exc_info=True)
            await deps.thought_stream.emit_error(
                f"Failed to analyze request: {e}",
                node_name="Analyzer",
            )
            state.error = str(e)
            return End(f"I encountered an error while analyzing your request: {e}")


@dataclass
class PlannerNode(BaseNode[CopilotState, GraphDeps, str]):
    """Creates an execution plan for complex requests.

    Uses available skills to construct a multi-step plan.
    """

    async def run(self, ctx: GraphRunContext[CopilotState, GraphDeps]) -> "ExecutorNode":
        """Create an execution plan."""
        state = ctx.state
        deps = ctx.deps

        await deps.thought_stream.emit_planning(
            f"Creating execution plan for: {state.intent}",
            node_name="Planner",
        )

        # Get skill details for planning
        skills_info = []
        for skill_name in state.available_skills:
            skill = deps.skill_registry.get_skill(skill_name)
            if skill:
                skills_info.append(f"- {skill.metadata.name}: {skill.metadata.description}")

        system_prompt = f"""You are a planning assistant that creates execution plans.

Available skills:
{chr(10).join(skills_info)}

Create a plan to accomplish the user's goal. Each step should:
1. Have a clear description
2. Specify which skill to use (if any)
3. Specify any parameters needed
4. List dependencies on other steps (by step number)

Keep plans concise - typically 1-3 steps for most requests.

User intent: {state.intent}
Data context: {state.data_context}
Has data: {state.data is not None and len(state.data) > 0}"""

        try:
            agent = deps.llm_provider.create_agent(
                system_prompt=system_prompt,
                result_type=PlanResult,
            )

            result = await agent.run(state.message)
            plan_result = result.output

            # Convert to ExecutionPlan
            steps = []
            for i, step_data in enumerate(plan_result.steps, 1):
                steps.append(
                    PlanStep(
                        step_number=i,
                        description=step_data.get("description", ""),
                        skill_name=step_data.get("skill_name"),
                        skill_params=step_data.get("params", {}),
                        depends_on=step_data.get("depends_on", []),
                    )
                )

            state.plan = ExecutionPlan(goal=plan_result.goal, steps=steps)

            await deps.thought_stream.emit_planning(
                f"Plan created with {len(steps)} steps:\n"
                + "\n".join(f"  {i}. {s.description}" for i, s in enumerate(steps, 1)),
                node_name="Planner",
            )

        except Exception as e:
            logger.error(f"Planning failed: {e}", exc_info=True)
            await deps.thought_stream.emit_error(
                f"Failed to create plan: {e}",
                node_name="Planner",
            )
            # Create a fallback single-step plan
            state.plan = ExecutionPlan(
                goal=state.intent,
                steps=[
                    PlanStep(
                        step_number=1,
                        description="Attempt to answer the request directly",
                        skill_name=state.available_skills[0] if state.available_skills else None,
                    )
                ],
            )

        return ExecutorNode()


@dataclass
class ExecutorNode(BaseNode[CopilotState, GraphDeps, str]):
    """Executes the plan by running skills.

    Processes each step in the plan and collects results.
    """

    async def run(
        self, ctx: GraphRunContext[CopilotState, GraphDeps]
    ) -> "ReflectorNode | End[str]":
        """Execute the plan steps."""
        state = ctx.state
        deps = ctx.deps

        if not state.plan:
            await deps.thought_stream.emit_error(
                "No plan to execute",
                node_name="Executor",
            )
            return End("I couldn't create a plan for this request.")

        await deps.thought_stream.emit_observation(
            f"Executing plan: {state.plan.goal}",
            node_name="Executor",
        )

        # Execute each step
        while not state.plan.is_complete and not state.plan.has_failed:
            step = state.plan.get_next_step()
            if not step:
                break

            step.status = "in_progress"

            await deps.thought_stream.emit_tool_use(
                f"Step {step.step_number}: {step.description}",
                skill_name=step.skill_name or "direct",
                node_name="Executor",
            )

            try:
                if step.skill_name:
                    # Execute skill
                    skill = deps.skill_registry.get_skill(step.skill_name)
                    if skill:
                        result = await skill.execute(
                            message=state.message,
                            data=state.data,
                            data_context=state.data_context,
                            params=step.skill_params,
                            thought_stream=deps.thought_stream,
                        )
                        state.skill_outputs[step.skill_name] = result
                        state.plan.mark_step_complete(step.step_number, result)

                        await deps.thought_stream.emit_observation(
                            f"Skill '{step.skill_name}' completed",
                            node_name="Executor",
                            skill_name=step.skill_name,
                        )
                    else:
                        state.plan.mark_step_failed(
                            step.step_number, f"Skill '{step.skill_name}' not found"
                        )
                else:
                    # No skill specified - use LLM directly with data
                    # Include actual data in the prompt for data queries
                    data_sample = ""
                    if state.data and len(state.data) > 0:
                        import json

                        # Include up to 100 records for context
                        sample_size = min(100, len(state.data))
                        data_sample = f"\n\nData ({sample_size} of {len(state.data)} records):\n{json.dumps(state.data[:sample_size], indent=2, default=str)}"

                    response = await deps.llm_provider.generate(
                        prompt=f"{state.message}\n\nData Context: {state.data_context}{data_sample}",
                        system_prompt="""You are a helpful AI assistant analyzing evaluation data.
You have access to the actual data. Use it to answer the user's question directly and specifically.
Provide concrete answers based on the data - don't give generic instructions.""",
                    )
                    state.plan.mark_step_complete(step.step_number, response)

            except Exception as e:
                logger.error(f"Step execution failed: {e}", exc_info=True)
                state.plan.mark_step_failed(step.step_number, str(e))
                await deps.thought_stream.emit_error(
                    f"Step {step.step_number} failed: {e}",
                    node_name="Executor",
                )

        if state.plan.has_failed:
            # Try to recover with partial results
            results = state.plan.completed_results
            if results:
                state.intermediate_results = results
            else:
                return End("I encountered errors while processing your request.")

        # Collect all results
        state.intermediate_results = state.plan.completed_results

        return ReflectorNode()


@dataclass
class ReflectorNode(BaseNode[CopilotState, GraphDeps, str]):
    """Reflects on execution results and determines quality.

    May trigger replanning if quality is below threshold.
    """

    async def run(self, ctx: GraphRunContext[CopilotState, GraphDeps]) -> "PlannerNode | End[str]":
        """Evaluate results and decide on next steps."""
        state = ctx.state
        deps = ctx.deps

        await deps.thought_stream.emit_reflection(
            "Evaluating execution results...",
            node_name="Reflector",
        )

        # Check iteration limit
        if state.iteration >= state.max_iterations:
            await deps.thought_stream.emit_decision(
                f"Reached maximum iterations ({state.max_iterations}). Returning best result.",
                node_name="Reflector",
            )
            return self._generate_final_response(state, deps)

        # Compile results for evaluation
        results_summary = "\n".join(str(r)[:500] for r in state.intermediate_results if r)

        system_prompt = """You are evaluating the quality of AI-generated responses.

Assess whether the response:
1. Directly addresses the user's original question
2. Is accurate and well-reasoned
3. Is clear and well-structured
4. Could be improved with additional information

Provide a quality score (0-1) and feedback."""

        try:
            agent = deps.llm_provider.create_agent(
                system_prompt=system_prompt,
                result_type=ReflectionResult,
            )

            result = await agent.run(
                f"Original request: {state.message}\n\n"
                f"Results obtained:\n{results_summary}\n\n"
                f"Data context: {state.data_context}"
            )
            reflection = result.output

            state.quality_score = reflection.quality_score
            state.quality_feedback = reflection.feedback

            await deps.thought_stream.emit_reflection(
                f"Quality score: {reflection.quality_score:.2f}\n"
                f"Feedback: {reflection.feedback}",
                node_name="Reflector",
            )

            # Decide whether to replan
            if reflection.needs_replanning and state.quality_score < deps.quality_threshold:
                await deps.thought_stream.emit_decision(
                    f"Quality below threshold ({deps.quality_threshold}). Replanning...",
                    node_name="Reflector",
                )
                state.reset_for_replanning()
                return PlannerNode()

        except Exception as e:
            logger.error(f"Reflection failed: {e}", exc_info=True)
            # Continue with current results

        return await self._generate_final_response(state, deps)

    async def _generate_final_response(self, state: CopilotState, deps: GraphDeps) -> End[str]:
        """Generate the final response from collected results."""
        await deps.thought_stream.emit_success(
            "Generating final response...",
            node_name="Reflector",
        )

        # Combine all results
        results_text = "\n\n".join(str(r) for r in state.intermediate_results if r)

        # Include data sample if available and relevant
        data_sample = ""
        if state.data and len(state.data) > 0 and state.requires_data:
            import json

            sample_size = min(50, len(state.data))
            data_sample = f"\n\nData sample ({sample_size} records):\n{json.dumps(state.data[:sample_size], indent=2, default=str)}"

        # Use LLM to synthesize final response
        system_prompt = """You are a helpful AI assistant synthesizing results.

Create a clear, concise response that:
1. Directly answers the user's question with specific data
2. Incorporates the analysis results
3. Is well-structured and easy to understand

Provide concrete answers - do not give generic instructions.
Do not include meta-commentary about the process."""

        try:
            response = await deps.llm_provider.generate(
                prompt=f"User request: {state.message}\n\n"
                f"Analysis results:\n{results_text}\n\n"
                f"Data context: {state.data_context}{data_sample}",
                system_prompt=system_prompt,
            )
            state.final_response = response
            return End(response)

        except Exception as e:
            logger.error(f"Final response generation failed: {e}", exc_info=True)
            # Return raw results as fallback
            state.final_response = (
                results_text or "I completed the analysis but couldn't generate a summary."
            )
            return End(state.final_response)
