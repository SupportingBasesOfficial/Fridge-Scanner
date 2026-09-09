import type {
  CommandId,
  CompatibilityEvidenceId,
  CompatibilityMappingId,
  HouseholdId,
  Instant,
  PrincipalId,
} from '@fridge/domain';
import { instant } from '@fridge/domain';
import type { IdentifierGenerator, TransactionHandle, TransactionManager, UseCase } from './index.js';

export interface CommitCompatibilityDecisionEvidenceInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly compatibilityMappingId: CompatibilityMappingId;
  readonly provenance: string;
}

export interface CommitCompatibilityDecisionEvidenceOutput {
  readonly compatibilityEvidenceId: CompatibilityEvidenceId;
  readonly evaluationAnchor: Instant;
}

export interface CommitCompatibilityDecisionEvidencePersistenceInput {
  readonly commandId: CommandId;
  readonly candidateCompatibilityEvidenceId: CompatibilityEvidenceId;
  readonly compatibilityMappingId: CompatibilityMappingId;
  readonly provenance: string;
}

export interface CompatibilityDecisionEvidenceWriter {
  commitCompatibilityDecisionEvidence(
    transaction: TransactionHandle,
    input: CommitCompatibilityDecisionEvidencePersistenceInput,
  ): Promise<CommitCompatibilityDecisionEvidenceOutput>;
}

function exactNonblank(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be nonblank`);
  }
  return value;
}

export class CommitCompatibilityDecisionEvidenceUseCase
  implements UseCase<
    CommitCompatibilityDecisionEvidenceInput,
    CommitCompatibilityDecisionEvidenceOutput
  >
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly evidence: CompatibilityDecisionEvidenceWriter,
    private readonly evidenceIds: IdentifierGenerator<CompatibilityEvidenceId>,
  ) {}

  async execute(
    input: CommitCompatibilityDecisionEvidenceInput,
  ): Promise<CommitCompatibilityDecisionEvidenceOutput> {
    const provenance = exactNonblank(input.provenance, 'provenance');
    const candidateCompatibilityEvidenceId = this.evidenceIds.generate();
    let result: CommitCompatibilityDecisionEvidenceOutput | undefined;

    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        result = await this.evidence.commitCompatibilityDecisionEvidence(transaction, {
          commandId: input.commandId,
          candidateCompatibilityEvidenceId,
          compatibilityMappingId: input.compatibilityMappingId,
          provenance,
        });
      },
    );

    if (result === undefined) {
      throw new TypeError('compatibility evidence writer did not return committed evidence');
    }

    return {
      compatibilityEvidenceId: result.compatibilityEvidenceId,
      evaluationAnchor: instant(result.evaluationAnchor),
    };
  }
}
