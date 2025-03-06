import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = {
  args: {
    children: '主要按钮',
    variant: 'primary',
  },
}

export const Secondary: Story = {
  args: {
    children: '次要按钮',
    variant: 'secondary',
  },
}

export const Outline: Story = {
  args: {
    children: '边框按钮',
    variant: 'outline',
  },
}

export const Small: Story = {
  args: {
    children: '小按钮',
    size: 'sm',
  },
}

export const Large: Story = {
  args: {
    children: '大按钮',
    size: 'lg',
  },
}

export const Disabled: Story = {
  args: {
    children: '禁用按钮',
    disabled: true,
  },
} 