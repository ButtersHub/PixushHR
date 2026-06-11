# Office Hour Summary — The Big Agents Competition

> Source: email from the competition organizers. Original written in Hebrew; translated to
> English below. An accompanying note read:
> _"Adding an Open hour summary. Hope this helps. Let me know if you have any further questions."_

In the "Office hour — the big agents competition" meeting, the main principles for the
agent demo and the evaluation method in the competition were explained, with emphasis on
on-boarding and off-boarding scenarios, use of synthetic data, and an accessible user
experience. Participants discussed "Timeout and run limits", "Tests and Sensei", "Scenario
scope: onboarding and offboarding", and "User experience, communication channels and
synthetic data". It was clarified that there is no expectation of a perfect product, but
rather a quality demo that demonstrates the capability.

## Decisions and Outcomes

- **Timeout:** Sensei's default timeout (60 seconds) can be extended as needed — for
  example to 120 seconds — to support scenarios like offboarding.
- **Execution:** Scenario runs on the same endpoint are performed serially, not in parallel.
- **Escalation is acceptable:** The workflow may end in an escalation and does not have to
  be fully end-to-end up to actually sending a termination letter.
- **Scope:** The focus for the scenario is on on-boarding and off-boarding **only** — not
  additional processes such as maternity leave or unpaid leave.
- **Synthetic data:** At the demo stage it is permitted, and even recommended, to use
  synthetic data only, with no connection to real data.
- **Communication priority:** The emphasis is on communication with the **Hiring Managers**;
  the Department Peer is only a nice-to-have.
- **Tooling focus:** Participants were encouraged to focus on building the demo and the task
  itself, and less on local work with Sensei — Sensei will run the tests and scoring when the
  agent is uploaded to the platform.

## Open Points / Next Steps

- There will be a further **Discovery call with Papaya** for those who advance to the final,
  to sharpen what is essential vs. secondary in the requirements.
- Participants may continue sending questions by email to the organizers regarding
  interpretation of the requirements, additional communication channels, and deepening the
  integrations for the demo.
- The **transcript** of the call will be published, so participants can revisit the
  clarifications given.
- The agent is expected to be made accessible in the channels where employees already work
  (**Teams, email**), but the exact implementation method remains the participants' choice
  within the demo.
