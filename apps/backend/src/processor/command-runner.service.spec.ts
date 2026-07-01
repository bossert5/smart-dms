import {
  CommandFailedError,
  CommandRunnerService,
} from './command-runner.service';

describe('CommandRunnerService', () => {
  it('includes stderr in failed command errors', async () => {
    const service = new CommandRunnerService();

    await expect(
      service.run(process.execPath, [
        '-e',
        'process.stderr.write("helper command is missing"); process.exit(2);',
      ]),
    ).rejects.toMatchObject<Partial<CommandFailedError>>({
      message:
        `${process.execPath} failed with exit code 2. ` +
        'stderr: helper command is missing',
    });
  });
});
