<?php
declare(strict_types=1);

namespace Medbiohim\Auth;

final class AuthUser
{
    public function __construct(
        public readonly string $id,
        public readonly string $email,
        public readonly ?string $role = null,
        public readonly array $raw = [],
    ) {
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'role' => $this->role,
        ];
    }
}
